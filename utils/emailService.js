/**
 * Mock Email Service
 * Previously used Nodemailer with Gmail.
 * User requested removal of email verification/sending.
 */

const sendEmail = async (to, subject, html) => {
    // In development, we just log to console
    console.log('-----------------------------------------');
    console.log('📧 MOCK EMAIL SENT');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Content: (Check logs etc.)');
    console.log('-----------------------------------------');
    
    // Always return success so the flow continues without real email
    return { success: true, messageId: 'mock-id-' + Date.now() };
};

module.exports = sendEmail;
