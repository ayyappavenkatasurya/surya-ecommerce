const generateEmailHtml = (options) => {
    const {
      recipientName = 'Valued Customer',
      subject = 'Notification',
      greeting = `Hello ${recipientName},`,
      bodyLines = [],
      buttonUrl,
      buttonText,
      footerText = `© ${new Date().getFullYear()} miniapp. All rights reserved.`,
      companyName = 'miniapp',
      companyAddress = 'Your Company Address Here',
    } = options;
  
    const styles = {
      body: `margin: 0; padding: 0; -webkit-text-size-adjust: 100%; background-color: #f0f5fd;`,
      wrapper: `width: 100%; table-layout: fixed; -webkit-text-size-adjust: 100%;`,
      main: `background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; font-family: Arial, sans-serif; color: #333333; box-shadow: 0 2px 10px rgba(0,0,0,0.1); border-radius: 8px; overflow: hidden;`,
      header: `background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: #ffffff; padding: 25px 20px; text-align: center; border-radius: 8px 8px 0 0; background-color: #007bff;`,
      headerH1: `margin: 0; font-size: 24px; font-weight: bold;`,
      content: `padding: 30px 25px; text-align: left; font-size: 16px; line-height: 1.6;`,
      greeting: `font-size: 18px; font-weight: bold; margin-bottom: 15px;`,
      paragraph: `margin: 0 0 15px 0;`,
      buttonWrapper: `padding: 15px 0; text-align: center;`,
      buttonLink: `background-color: #28a745; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; border: none; cursor: pointer; font-size: 16px;`,
      footer: `background-color: #e9ecef; color: #6c757d; padding: 20px 25px; text-align: center; font-size: 12px; line-height: 1.4; border-radius: 0 0 8px 8px;`,
      footerLink: `color: #007bff; text-decoration: none;`,
      preheader: `display: none !important; visibility: hidden; mso-hide: all; font-size: 1px; color: #ffffff; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;`,
    };
  
    const bodyHtml = bodyLines.map(line => `<p style="${styles.paragraph}">${String(line).replace(/</g, "<").replace(/>/g, ">")}</p>`)
                             .map(line => line.replace(/<strong>/g, '<strong>').replace(/<\/strong>/g, '</strong>')
                                               .replace(/<br>/g, '<br>')
                                               .replace(/<h3 style="(.*?)">/g, '<h3 style="$1">').replace(/<\/h3>/g, '</h3>')
                                               .replace(/<ul style="(.*?)">/g, '<ul style="$1">').replace(/<\/ul>/g, '</ul>')
                                               .replace(/<li style="(.*?)">/g, '<li style="$1">').replace(/<\/li>/g, '</li>')
                                               .replace(/<a href="(.*?)"(.*?)>/g, '<a href="$1"$2>').replace(/<\/a>/g, '</a>')
                             )
                             .join('');
  
    let buttonHtml = '';
    if (buttonUrl && buttonText) {
      const safeButtonUrl = buttonUrl.startsWith('http') ? buttonUrl : '#';
      const safeButtonText = String(buttonText).replace(/</g, "<").replace(/>/g, ">");
      buttonHtml = `
        <table border="0" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="${styles.buttonWrapper}">
              <a href="${safeButtonUrl}" target="_blank" style="${styles.buttonLink}">${safeButtonText}</a>
            </td>
          </tr>
        </table>`;
    }
  
    const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <title>${String(subject).replace(/</g, "<")}</title>
    <style type="text/css">
      body { ${styles.body} }
      .wrapper { ${styles.wrapper} }
      .main { ${styles.main} }
      @media screen and (max-width: 600px) {
        .main { width: 95% !important; max-width: 95%; }
        .content { padding: 20px 15px !important; }
        .header h1 { font-size: 20px !important; }
        .buttonLink { padding: 10px 20px !important; font-size: 15px !important; }
      }
    </style>
  </head>
  <body style="${styles.body}">
    <span style="${styles.preheader}">${String(subject).replace(/</g, "<")} - ${bodyLines.length > 0 ? String(bodyLines[0]).substring(0, 50).replace(/<[^>]*>?/gm, '') + '...' : ''}</span>
    <center class="wrapper" style="${styles.wrapper}">
      <table class="main" width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation" style="${styles.main}">
        <tr>
          <td class="header" style="${styles.header}">
            <h1 style="${styles.headerH1}">${String(companyName).replace(/</g, "<")}</h1>
          </td>
        </tr>
        <tr>
          <td class="content" style="${styles.content}">
            <p style="${styles.greeting}">${greeting}</p>
            ${bodyHtml}
            ${buttonHtml}
            <p style="${styles.paragraph}">If you have any questions, feel free to contact our support team.</p>
            <p style="${styles.paragraph}">Thanks,<br>The ${String(companyName).replace(/</g, "<")} Team</p>
          </td>
        </tr>
        <tr>
          <td class="footer" style="${styles.footer}">
            <p style="margin:0 0 5px 0;">${String(footerText).replace(/</g, "<")}</p>
             ${companyAddress ? `<p style="margin:0 0 5px 0;">${String(companyAddress).replace(/</g, "<")}</p>` : ''}
          </td>
        </tr>
      </table>
    </center>
  </body>
  </html>
    `;
  
    return html;
  };
  
  module.exports = { generateEmailHtml };