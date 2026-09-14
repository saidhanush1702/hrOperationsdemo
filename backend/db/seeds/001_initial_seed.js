import { v4 as uuidv4 } from 'uuid';
import { encryptPassword } from '../../utils/crypto.js'; // Adjust path if needed

export const runSeed = async (connection) => {
    console.log("Seeding lookup tables...");
    await connection.query(`INSERT IGNORE INTO lkp_genders (name) VALUES ('Male'), ('Female'), ('Other'), ('Prefer not to say')`);
    await connection.query(`INSERT IGNORE INTO lkp_employee_types (name) VALUES ('Full Time'), ('Part Time'), ('Contractor'), ('Intern')`);
    await connection.query(`INSERT IGNORE INTO lkp_countries (name) VALUES ('United States'), ('India'), ('Canada'), ('United Kingdom')`);
    await connection.query(`INSERT IGNORE INTO lkp_immigration_statuses (name) VALUES ('Stem OPT'), ('H4 EAD'), ('H1-B'), ('OPT'), ('CPT'), ('GC'), ('CITIZEN')`);
    await connection.query(`INSERT IGNORE INTO lkp_pay_types (name) VALUES ('W2'), ('C2C'), ('1099')`);

    console.log("Seeding Super Admin...");
    const [rows] = await connection.query('SELECT * FROM users WHERE role = "SUPER_ADMIN"');
    if (rows.length === 0) {
        const adminId = uuidv4();
        const encryptedPw = encryptPassword('admin123');
        await connection.query(
            'INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [adminId, 'superadmin@system.com', encryptedPw, 'SUPER_ADMIN']
        );
        console.log("Super Admin Seeded: superadmin@system.com / admin123");
    } else {
        console.log("Super Admin already exists. Skipping.");
    }
};