const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: parseInt(process.env.MAIL_PORT, 10),
  secure: parseInt(process.env.MAIL_PORT, 10) === 465,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

transporter.verify((error, success) => {
  if (error) {
    console.error('Error with Nodemailer transporter configuration:', error);
  } else {
    console.log('Nodemailer transporter is ready to send emails');
  }
});

const sendEmail = async (to, subject, text, html) => {
  try {
    await transporter.sendMail({
      from: process.env.MAIL_FROM,
      to: to,
      subject: subject,
      text: text,
      html: html,
    });
    console.log(`Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error(`Error sending email to ${to}:`, error);
    return false;
  }
};

module.exports = { sendEmail };
