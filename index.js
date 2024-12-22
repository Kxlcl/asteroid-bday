const express = require("express");
const path = require('path');
const { Client } = require("pg");
const fetch = require("node-fetch"); // To call NASA API
const app = express();
const port = 3000;

// Middleware to parse form data
app.use(express.urlencoded({ extended: true }));

// Serve static files like CSS
app.use(express.static("public"));

// Set the views directory
app.set('views', path.join(__dirname, 'templates'));

// Set ejs as the templating engine
app.set('view engine', 'ejs');

// Route to render the login page
app.get('/', (req, res) => {
    res.render('login');  // Renders login.ejs
});

// Handle POST request from login form
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    const client = new Client({
        user: 'admin',
        host: 'localhost',
        database: 'asteroids',
        password: 'admin', // Replace with your actual password
        port: 5432
    });

    try {
        await client.connect();

        // Check if user exists in the database
        let result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        
        // If user does not exist, create a new user
        if (result.rows.length === 0) {
            await client.query('INSERT INTO users (email, password) VALUES ($1, $2)', [email, password]);
            result = await client.query('SELECT * FROM users WHERE email = $1', [email]);
        }

        // If user found, proceed to home
        const userId = result.rows[0].id;
        res.redirect(`/home/${userId}`);
    } catch (err) {
        console.error('Error querying database:', err);
        res.send('Error logging in.');
    } finally {
        await client.end();
    }
});

// Home page for authenticated users to see their data
app.get('/home/:userId', async (req, res) => {
    const userId = req.params.userId;

    const client = new Client({
        user: 'admin',
        host: 'localhost',
        database: 'asteroids',
        password: 'admin',
        port: 5432
    });

    try {
        await client.connect();

        // Query the asteroid data for the user
        const asteroidQuery = `SELECT * FROM asteroids WHERE user_id = $1`;
        const asteroidResult = await client.query(asteroidQuery, [userId]);

        // Render the home page with asteroid data
        res.render('home', {
            userId: userId,
            asteroidDetails: asteroidResult.rows
        });
    } catch (err) {
        console.error('Error retrieving asteroid data:', err);
        res.send('Error displaying home page.');
    } finally {
        await client.end();
    }
});

// Route to fetch asteroid info for a user's birthday
app.post('/find-asteroids', async (req, res) => {
    const { birthday, userId } = req.body;

    const client = new Client({
        user: 'admin',
        host: 'localhost',
        database: 'asteroids',
        password: 'admin',
        port: 5432
    });

    try {
        await client.connect();

        // Example logic for querying asteroid data (replace with real implementation)
        const startDate = birthday;  // Use the user's birthday for startDate
        const endDate = birthday;    // You might want to query asteroids in a date range

        const apiUrl = `https://api.nasa.gov/neo/rest/v1/feed?start_date=${startDate}&end_date=${endDate}&api_key=DEMO_KEY`;
        const asteroidResponse = await fetch(apiUrl);
        const asteroidData = await asteroidResponse.json();

        if (!asteroidData.near_earth_objects || Object.keys(asteroidData.near_earth_objects).length === 0) {
            res.send('No asteroid data available.');
            return;
        }

        // Variables to hold the closest and largest asteroids
        let closestAsteroid = null;
        let largestAsteroid = null;

        // Loop through the asteroid data and determine closest and largest
        for (const date in asteroidData.near_earth_objects) {
            for (const asteroid of asteroidData.near_earth_objects[date]) {
                const asteroidName = asteroid.name;
                const approachDate = asteroid.close_approach_data[0].close_approach_date;
                const missDistanceKm = asteroid.close_approach_data[0].miss_distance.km;
                const estimatedDiameterMax = asteroid.estimated_diameter.kilometers.estimated_diameter_max;
                const potentiallyHazardous = asteroid.is_potentially_hazardous_asteroid;

                // Track the closest asteroid
                if (!closestAsteroid || parseFloat(missDistanceKm) < parseFloat(closestAsteroid.miss_distance_km)) {
                    closestAsteroid = {
                        name: asteroidName,
                        approach_date: approachDate,
                        miss_distance_km: missDistanceKm,
                        estimated_diameter_max: estimatedDiameterMax,
                        potentially_hazardous: potentiallyHazardous
                    };
                }

                // Track the largest asteroid
                if (!largestAsteroid || parseFloat(estimatedDiameterMax) > parseFloat(largestAsteroid.estimated_diameter_max)) {
                    largestAsteroid = {
                        name: asteroidName,
                        approach_date: approachDate,
                        miss_distance_km: missDistanceKm,
                        estimated_diameter_max: estimatedDiameterMax,
                        potentially_hazardous: potentiallyHazardous
                    };
                }

                // Optionally, insert the asteroid into the database
                const insertAsteroidQuery = `
                    INSERT INTO asteroids (user_id, asteroid_name, approach_date, miss_distance_km, estimated_diameter_max, potentially_hazardous)
                    VALUES ($1, $2, $3, $4, $5, $6)
                `;
        
                await client.query(insertAsteroidQuery, [
                    userId, asteroidName, approachDate, missDistanceKm, estimatedDiameterMax, potentiallyHazardous
                ]);
            }
        }

        // If we have at least one closest and largest asteroid, render the details page
        if (closestAsteroid && largestAsteroid) {
            res.render('details', {
                closestAsteroid,
                largestAsteroid
            });
        } else {
            res.send('No relevant asteroid data available.');
        }
    } catch (err) {
        console.error('Error handling asteroid data:', err);
        res.send('Error processing asteroid information.');
    } finally {
        await client.end();
    }
});


// Route for users to see their asteroid details
app.get('/details/:userId', async (req, res) => {
    const userId = req.params.userId;

    const client = new Client({
        user: 'admin',
        host: 'localhost',
        database: 'asteroids',
        password: 'admin',
        port: 5432
    });

    try {
        await client.connect();

        // Query the asteroid data for the user
        const asteroidQuery = `SELECT * FROM asteroids WHERE user_id = $1`;
        const asteroidResult = await client.query(asteroidQuery, [userId]);

        // Render the details page and pass asteroid data
        res.render('details', {
            asteroidDetails: asteroidResult.rows
        });
    } catch (err) {
        console.error('Error retrieving asteroid data:', err);
        res.send('Error displaying asteroid details.');
    } finally {
        await client.end();
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
