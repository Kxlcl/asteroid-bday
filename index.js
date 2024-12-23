//Name: Kelly Lin
//Class: CSCI395 Web Development
//Professor: Jaime Canizales 

//import all packages using npm install and includes
const express = require("express"); 
const path = require("path");
const { Client } = require("pg");
const axios = require("axios"); //used Axios for getting data from NASA API
const app = express();
const port = 3000; 

app.use(express.urlencoded({ extended: true }));
app.use(express.static("public")); 

//Templates for EJS files 
app.set("views", path.join(__dirname, "templates"));
app.set("view engine", "ejs");

//Connecting to PSQL db named asteroids
const getDbClient = () =>
    new Client({
        user: "admin",
        host: "localhost",
        database: "asteroids",
        password: "admin",
        port: 5432,
    });

//default page is the login page
app.get("/", (req, res) => {
    res.render("login");
});

//Basic login authentication through the db
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    const client = getDbClient();

    try {
        await client.connect();
        let userResult = await client.query(
            "SELECT * FROM users WHERE email = $1",
            [email]
        );

        //By default, if no user matches from the db, a new user will be created and inserted
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
    } 
    catch (err) {
        console.error("Login Error:", err.message);
        res.status(500).send("Could not login in due to server connection issues.");
    } 
    finally {
        await client.end();
    }
});

//After logging in, users will be directed to the home dashboard page
app.get("/home/:userId", async (req, res) => {
    const { userId } = req.params;
    const client = getDbClient();

    try {
        await client.connect();
        const asteroidQuery = "SELECT * FROM asteroids WHERE user_id = $1";
        const asteroidResult = await client.query(asteroidQuery, [userId]);
        res.render("home", { userId, asteroidDetails: asteroidResult.rows });
    } 
    catch (err) {
        console.error("Home Page Error:", err.message);
        res.status(500).send("Could not display homepage due to server connection issues.");
    } 
    finally {
        await client.end();
    }
});

//Use NASA API to retrieve asteroid info
app.post('/find-asteroids', async (req, res) => {
    const { birthday, userId } = req.body;

    const client = getDbClient();
    try {
        await client.connect();

        //default API key is DEMO_KEY
        const apiUrl = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${birthday}&end_date=${birthday}&api_key=DEMO_KEY`;

        //fetch data with a single date using Axios
        const response = await axios.get(apiUrl);
        const data = response.data;

        if (!data.near_earth_objects) {
            return res.send('No data available.');
        }

        //create temp array to store information to be inserted into db
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
            return res.send('Nothing was found.');
        }

        //Filter by closest asteroid found
        const closestAsteroid = asteroids.reduce((closest, curr) =>
            parseFloat(curr.miss_distance_km) < parseFloat(closest.miss_distance_km) ? curr : closest, asteroids[0]);

        //Prevent duplicates in the db from being inserted
        const existingAsteroidQuery = `
            SELECT * FROM asteroids 
            WHERE user_id = $1 AND asteroid_name = $2 AND approach_date = $3
`;
        const existing = await client.query(existingAsteroidQuery, [
            userId, closestAsteroid.name, closestAsteroid.approach_date
        ]);

        //Insert into db if the asteroid is not a duplicate
        if (existing.rows.length === 0) {
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

        // Insert details into details.ejs and display to the user
        res.render('details', { closestAsteroid });
    } 
    catch (err) {
        console.error('Asteroid Data Error:', err);
        res.status(500).send('Could not process information due to API error.');
    } 
    finally {
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
