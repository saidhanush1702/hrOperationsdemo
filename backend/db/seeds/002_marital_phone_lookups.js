export const runSeed2 = async (connection) => {
    console.log('Seeding marital statuses and phone codes...');

    // Marital Statuses
    const maritalStatuses = ['Single', 'Married', 'Separated'];
    for (const status of maritalStatuses) {
        await connection.query(`INSERT IGNORE INTO lkp_marital_statuses (name) VALUES (?)`, [status]);
    }

    // Phone Country Codes
    const phoneCodes = [
        { country: 'Canada', code: '+1' },
        { country: 'United States', code: '+1' },
        { country: 'United Kingdom', code: '+44' },
        { country: 'India', code: '+91' }
    ];
    for (const pc of phoneCodes) {
        await connection.query(
            `INSERT IGNORE INTO lkp_phone_codes (country_name, dial_code) VALUES (?, ?)`,
            [pc.country, pc.code]
        );
    }

    const countries = ['Canada', 'United Kingdom', 'United States', 'India'];
    for (const country of countries) {
        await connection.query(`INSERT IGNORE INTO lkp_countries (name) VALUES (?)`, [country]);
    }

    console.log('Seeding client contact types...');
    const contactTypes = ['HR', 'Accounts', 'Timesheets', 'Manager'];
    for (const type of contactTypes) {
        await connection.query(`INSERT IGNORE INTO lkp_client_contact_types (name) VALUES (?)`, [type]);
    }
};