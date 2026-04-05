const path = require('path');           
require('process');
const fs = require('fs');   

const nodeMailer = require('nodemailer');
const config = require('../config');
//Send One Mail
exports.SendEmail = function(email_to, subject, text, callback){

    if(!config.smtp_enabled)
        return;

    console.log("Sending email to: " + email_to);

    let transporter = nodeMailer.createTransport({
        host: config.smtp_server,
        port: config.smtp_port,               //Port must be 465 (encrypted) or 587 (STARTTSL, first pre-request is unencrypted to know the encryption method supported, followed by encrypted request)
        secure: (config.smtp_port === "465"),  //On port 587 secure must be false since it will first send unsecured pre-request to know which encryption to use
		requireTLS: true,                     //Force using encryption on port 587 on the second request
        auth: {
            user: config.smtp_user,
            pass: config.smtp_password,
        }
    });

    let mailOptions = {
        from: '"' + config.smtp_name + '" <' + config.smtp_email + '>', // sender address
        to: email_to, // list of receivers
        subject: subject, // Subject line
        //text: text, // plain text body
        html: text, // html body
    };

    transporter.sendMail(mailOptions, (error) => {
        if (error) {
            if(callback)
                callback(false, error);
            console.log(error);
            return;
        }

        if(callback)
            callback(true);
    });

};

//Send same mail to multiple recipients (emails array)
exports.SendEmailList = function(emails, subject, text, callback){

    if(!config.smtp_enabled)
        return;

    if(!Array.isArray(emails))
        return;

    if(emails.length === 0)
        return;

    let transporter = nodeMailer.createTransport({
        pool: true,
        host: config.smtp_server,
        port: config.smtp_port,
        secure: (config.smtp_port === "465"),
		requireTLS: true,
        auth: {
            user: config.smtp_user,
            pass: config.smtp_password,
        }
    });

    const email_list = emails;
    const email_from = '"' + config.smtp_name + '" <' + config.smtp_email + '>';
    const total = emails.length;
    let sent_success = 0;
    let sent_count = 0;
    let ended = false;

    transporter.on("idle", function () {

        while (transporter.isIdle() && email_list.length > 0)
        {
            const email_to = email_list.shift();
            let mailOptions = {
                from: email_from,
                to: email_to, 
                subject: subject,
                html: text,
            };

            transporter.sendMail(mailOptions, (error) => {
                sent_count++;
                if (!error) {
                    sent_success++;
                }

                if(email_list.length === 0 && sent_count === total && !ended)
                {
                    ended = true;
                    if(callback)
                        callback(sent_success);
                }
            });
        }
    });
};

exports.ReadTemplate = function(template)
{
    const rootDir = path.dirname(require.main.filename);
    const fullpaths = path.join(rootDir, "emails", template);
    
    try{
        if(fs.existsSync(fullpaths))
            return fs.readFileSync(fullpaths, 'utf8');
        return null;
    }
    catch
    {
        return null;
    }
}