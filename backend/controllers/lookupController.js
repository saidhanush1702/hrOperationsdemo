import pool from '../config/db.js';

export const getAllLookups = async (req, res) => {
    try {
        const [genders] = await pool.query('SELECT * FROM lkp_genders');
        const [employeeTypes] = await pool.query('SELECT * FROM lkp_employee_types');
        const [countries] = await pool.query('SELECT * FROM lkp_countries');
        const [immigrationStatuses] = await pool.query('SELECT * FROM lkp_immigration_statuses');
        const [payTypes] = await pool.query('SELECT * FROM lkp_pay_types');
        const [clientContactTypes] = await pool.query('SELECT * FROM lkp_client_contact_types');
        
        // NEW LOOKUPS
        const [maritalStatuses] = await pool.query('SELECT * FROM lkp_marital_statuses');
        const [phoneCodes] = await pool.query('SELECT * FROM lkp_phone_codes');

        const [cycles] = await pool.query('SELECT * FROM lkp_cycles');
        const [frequencies] = await pool.query('SELECT * FROM lkp_frequencies');
        const [paymentTypes] = await pool.query('SELECT * FROM lkp_payment_types');

        res.json({
            genders,
            employeeTypes,
            countries,
            immigrationStatuses,
            payTypes,
            maritalStatuses,
            phoneCodes,
            clientContactTypes,
            cycles,
            frequencies,
            paymentTypes
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};