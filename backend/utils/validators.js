import Joi from 'joi';


export const orgSchema = Joi.object({
    name: Joi.string().min(3).max(100).required().messages({
        'string.min': 'Organization name must be at least 3 characters long.',
        'any.required': 'Organization name is required.'
    }),
    admin_email: Joi.string().email().required().messages({
        'string.email': 'Please provide a valid admin email address.',
        'any.required': 'Admin email is required.'
    }),
    admin_first_name: Joi.string().max(100).allow('', null),
    admin_last_name: Joi.string().max(100).allow('', null),
    admin_password: Joi.string().min(6).required().messages({
        'string.min': 'Password must be at least 6 characters.',
        'any.required': 'Admin password is required.'
    }),
    // Emailing the owner their login details is optional; off unless asked for.
    send_welcome_email: Joi.boolean().default(false),
    domain: Joi.string().hostname().allow('', null),
    address: Joi.string().max(255).allow('', null)
});