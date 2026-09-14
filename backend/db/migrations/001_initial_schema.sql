-- 1. Create Lookup Tables
CREATE TABLE IF NOT EXISTS lkp_genders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS lkp_employee_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS lkp_countries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS lkp_immigration_statuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS lkp_pay_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL
);

-- 2. Create Core Tables
CREATE TABLE IF NOT EXISTS organizations (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    admin_email VARCHAR(255) UNIQUE NOT NULL,
    domain VARCHAR(255),
    address TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_by CHAR(36),
    updated_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    organization_id CHAR(36),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('SUPER_ADMIN', 'ORG_ADMIN', 'HR', 'EMPLOYEE') NOT NULL,
    reset_code VARCHAR(10) DEFAULT NULL,
    reset_expiry DATETIME DEFAULT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_login TIMESTAMP NULL,
    created_by CHAR(36),
    updated_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Add Self-Referencing Foreign Keys for organizations now that users table exists
ALTER TABLE organizations ADD CONSTRAINT fk_org_created FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE organizations ADD CONSTRAINT fk_org_updated FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS employees (
    id CHAR(36) PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    user_id CHAR(36) UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    birth_date DATE,
    gender_id INT DEFAULT NULL,
    marital_status VARCHAR(50),
    title VARCHAR(100),
    employee_code VARCHAR(50),
    employee_type_id INT DEFAULT NULL,
    ssn VARCHAR(255),
    joining_date DATE NOT NULL,
    termination_date DATE,
    reason_for_termination TEXT,
    personal_email VARCHAR(255),
    phone_number VARCHAR(50),
    country_id INT DEFAULT NULL,
    e_verification_code VARCHAR(100),
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (gender_id) REFERENCES lkp_genders(id) ON DELETE SET NULL,
    FOREIGN KEY (employee_type_id) REFERENCES lkp_employee_types(id) ON DELETE SET NULL,
    FOREIGN KEY (country_id) REFERENCES lkp_countries(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS employee_immigrations (
    id CHAR(36) PRIMARY KEY,
    employee_id CHAR(36) NOT NULL,
    status_id INT DEFAULT NULL,
    start_date DATE,
    till_date DATE,
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (status_id) REFERENCES lkp_immigration_statuses(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS clients (
    id CHAR(36) PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS client_contacts (
    id CHAR(36) PRIMARY KEY,
    client_id CHAR(36) NOT NULL,
    contact_title VARCHAR(100) DEFAULT NULL,
    contact_name VARCHAR(100) NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50),
    is_primary BOOLEAN DEFAULT FALSE,
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS placements (
    id CHAR(36) PRIMARY KEY,
    organization_id CHAR(36) NOT NULL,
    employee_id CHAR(36) NOT NULL,
    client_id CHAR(36) NOT NULL,
    job_title VARCHAR(100) NOT NULL,
    placement_code VARCHAR(50),
    placement_type VARCHAR(50) DEFAULT 'Primary',
    start_date DATE NOT NULL,
    end_date DATE DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'Active',
    has_timesheets BOOLEAN DEFAULT FALSE,
    timesheet_cycle VARCHAR(50) DEFAULT NULL,
    timesheet_start_date DATE DEFAULT NULL,
    week_start_day VARCHAR(20) DEFAULT NULL,
    invoice_type VARCHAR(50) DEFAULT NULL,
    invoice_reference_no VARCHAR(100) DEFAULT NULL,
    invoice_frequency VARCHAR(50) DEFAULT 'Monthly',
    bill_rate DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    bill_frequency VARCHAR(50) DEFAULT 'Hourly', 
    pay_rate DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    pay_frequency VARCHAR(50) DEFAULT 'Hourly',
    pay_type_id INT DEFAULT NULL, 
    created_by CHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by CHAR(36),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    FOREIGN KEY (pay_type_id) REFERENCES lkp_pay_types(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);