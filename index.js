const express = require("express");
const path = require("path");
const { Client } = require("pg");
const fetch = require("node-fetch");
const app = express();
const port = 3000;

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public")); // Serve static files like CSS

// Templating engine setup
app.set("views", path.join(__dirname, "templates"));
app.set("view engine", "ejs");

// Reusable database connection function
const getDbClient = () =>
    new Client({
        user: "admin",
        host: "localhost",
        database: "asteroids",
        password: "admin", // Replace with actual password
        port: 5432,
    });

// Middleware to render the login page
app.get("/", (req, res) => {
    res.render("login"); // Renders login.ejs
});

// Login route: Authenticate users or register new ones
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const client = getDbClient();

    try {
        await client.connect();
        let userResult = await client.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        // If no user exists, register and fetch newly created user
        if (userResult.rows.length === 0) {
            await client.query(
                "INSERT INTO users (email, password) VALUES ($1, $2)",
                [email, password]
            );
            userResult = await client.query("SELECT * FROM users WHERE email = $1", [
                email,
            ]);
        }

        const userId = userResult.rows[0].id;
        res.redirect(`/home/${userId}`);
    } catch (err) {
        console.error("Error during login:", err.message);
        res.status(500).send("An error occurred during login.");
    } finally {
        await client.end();
    }
});

// Home route: Show asteroids associated with the user
app.get("/home/:userId", async (req, res) => {
    const { userId } = req.params;
    const client = getDbClient();

    try {
        await client.connect();
        const asteroidQuery = "SELECT * FROM asteroids WHERE user_id = $1";
        const asteroidResult = await client.query(asteroidQuery, [userId]);
        res.render("home", { userId, asteroidDetails: asteroidResult.rows });
    } catch (err) {
        console.error("Error displaying home page:", err.message);
        res.status(500).send("Error displaying home page.");
    } finally {
        await client.end();
    }
});

app.post('/find-asteroids', async (req, res) => {
    const { birthday, userId } = req.body;

    const client = getDbClient();
    try {
        await client.connect();

        // Call NASA API for asteroid data on the given date
        const apiUrl = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${birthday}&end_date=${birthday}&api_key=DEMO_KEY`;
        const response = await fetch(apiUrl);
        const data = await response.json();

        if (!data.near_earth_objects) {
            return res.send('No asteroid data available for the given date.');
        }

        const asteroids = [];
        for (const date in data.near_earth_objects) {
            for (const asteroid of data.near_earth_objects[date]) {
                const asteroidInfo = {
                    name: asteroid.name,
                    approach_date: asteroid.close_approach_data[0]?.close_approach_date || birthday,
                    miss_distance_km: asteroid.close_approach_data[0]?.miss_distance?.kilometers || 'N/A',
                    estimated_diameter_max: asteroid.estimated_diameter.kilometers?.estimated_diameter_max || 'N/A',
                    potentially_hazardous: asteroid.is_potentially_hazardous_asteroid,
                };
                asteroids.push(asteroidInfo);
            }
        }

        if (asteroids.length === 0) {
            return res.send('No relevant asteroids were found.');
        }

        // Find the closest asteroid (you can also prioritize largest instead)
        const closestAsteroid = asteroids.reduce((closest, curr) =>
            parseFloat(curr.miss_distance_km) < parseFloat(closest.miss_distance_km) ? curr : closest, asteroids[0]);

        // Check if this closest asteroid is already in the database
        const existingAsteroidQuery = `
            SELECT * FROM asteroids 
            WHERE user_id = $1 AND asteroid_name = $2 AND approach_date = $3
        `;
        const existing = await client.query(existingAsteroidQuery, [
            userId, closestAsteroid.name, closestAsteroid.approach_date
        ]);

        if (existing.rows.length === 0) {
            // Insert the closest asteroid if it doesn't already exist
            const insertAsteroidQuery = `
                INSERT INTO asteroids (user_id, asteroid_name, approach_date, miss_distance_km, estimated_diameter_max, potentially_hazardous)
                VALUES ($1, $2, $3, $4, $5, $6)
            `;
            await client.query(insertAsteroidQuery, [
                userId,
                closestAsteroid.name,
                closestAsteroid.approach_date,
                closestAsteroid.miss_distance_km,
                closestAsteroid.estimated_diameter_max,
                closestAsteroid.potentially_hazardous,
            ]);
        }

        // Return the asteroid details to the user
        res.render('details', { closestAsteroid });
    } catch (err) {
        console.error('Error fetching asteroid data:', err);
        res.status(500).send('Error processing asteroid information.');
    } finally {
        await client.end();
    }
});


// View asteroid details for a user
app.get("/details/:userId", async (req, res) => {
    const { userId } = req.params;
    const client = getDbClient();

    try {
        await client.connect();
        const asteroidQuery = "SELECT * FROM asteroids WHERE user_id = $1";
        const asteroidResult = await client.query(asteroidQuery, [userId]);
        res.render("details", { asteroidDetails: asteroidResult.rows });
    } catch (err) {
        console.error("Error retrieving asteroid details:", err.message);
        res.status(500).send("Error displaying asteroid details.");
    } finally {
        await client.end();
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
