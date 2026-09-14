import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT,
    multipleStatements: true
});

const runMigrations = async () => {
    let connection;
    try {
        connection = await pool.getConnection();
        console.log(`Connected to Database: ${process.env.DB_NAME}. Checking migrations...`);

        await connection.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id INT AUTO_INCREMENT PRIMARY KEY,
                migration_name VARCHAR(255) UNIQUE NOT NULL,
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Look at the new path here (./db/migrations):
        const migrationsDir = path.join(__dirname, './db/migrations');
        const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

        const [executedRows] = await connection.query('SELECT migration_name FROM schema_migrations');
        const executedMigrations = executedRows.map(row => row.migration_name);

        for (const file of files) {
            if (!executedMigrations.includes(file)) {
                console.log(`Running migration: ${file}...`);
                const filePath = path.join(migrationsDir, file);
                const sql = fs.readFileSync(filePath, 'utf8');
                
                const queries = sql.split(';').filter(q => q.trim() !== '');
                
                for (let query of queries) {
                    await connection.query(query);
                }

                await connection.query('INSERT INTO schema_migrations (migration_name) VALUES (?)', [file]);
                console.log(`✅ Migration ${file} applied successfully.`);
            }
        }

        console.log("✅ Migrations complete.");

    } catch (error) {
        console.error("❌ Migration failed:", error);
    } finally {
        if (connection) connection.release();
        await pool.end();
        process.exit();
    }
};

runMigrations();