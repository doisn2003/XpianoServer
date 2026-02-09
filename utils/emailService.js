const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Verify transporter connection
transporter.verify(function (error, success) {
    if (error) {
        console.error('Email Service Error:', error);
    } else {
        console.log('Email Service is ready to take messages');
    }
});

const sendEmail = async (to, subject, html) => {
    try {
        const info = await transporter.sendMail({
            from: `"Xpiano Support" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            html
        });
        console.log('✅ Email sent successfully!');
        console.log('   - To:', to);
        console.log('   - Message ID:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending email:', error);
        return { success: false, error: error.message };
    }
};

module.exports = sendEmail;
