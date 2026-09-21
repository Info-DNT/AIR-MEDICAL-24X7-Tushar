const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3001;
const PUBLIC_DIR = __dirname;

const server = http.createServer((req, res) => {
    // Parse URL and strip query parameters
    let urlPath = decodeURIComponent(req.url.split('?')[0]);
    
    // Strip project name folder prefix if accessing via subfolder path
    const folderPrefix = '/AIR-MEDICAL-24X7-Tushar-main';
    if (urlPath.startsWith(folderPrefix)) {
        urlPath = urlPath.slice(folderPrefix.length);
    }
    if (urlPath.startsWith('/AIR-MEDICAL-24X7-Tushar-main%20(2)')) {
        urlPath = urlPath.slice('/AIR-MEDICAL-24X7-Tushar-main%20(2)'.length);
    }

    if (urlPath === '/' || urlPath === '') {
        urlPath = '/index.html';
    }

    let filePath = path.join(PUBLIC_DIR, urlPath);

    // Mimic .htaccess rule 4: countries
    // /air-ambulance-{country} -> countries/air-ambulance-{country}.html
    if (urlPath.startsWith('/air-ambulance-')) {
        const countryFile = path.join(PUBLIC_DIR, 'countries', `${urlPath.slice(1)}.html`);
        if (fs.existsSync(countryFile)) {
            filePath = countryFile;
        }
    }

    // Mimic .htaccess rules for service pages and extensionless files
    const baseSlug = urlPath.slice(1);
    if (!baseSlug.includes('.') && baseSlug !== '') {
        // 1. Try services folder
        const serviceFile = path.join(PUBLIC_DIR, 'services', `${baseSlug}.html`);
        if (fs.existsSync(serviceFile)) {
            filePath = serviceFile;
        } else {
            // 2. Try root folder with .html extension
            const rootHtmlFile = path.join(PUBLIC_DIR, `${baseSlug}.html`);
            if (fs.existsSync(rootHtmlFile)) {
                filePath = rootHtmlFile;
            }
        }
    }

    // Check if path is directory and serve index.html
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }
    } catch (e) {}

    // Check if resolved file exists
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(`404 Not Found: Cannot GET ${urlPath}`);
        return;
    }

    // Determine content type
    const ext = path.extname(filePath).toLowerCase();
    let contentType = 'text/html';
    if (ext === '.css') contentType = 'text/css';
    else if (ext === '.js') contentType = 'application/javascript';
    else if (ext === '.json') contentType = 'application/json';
    else if (ext === '.png') contentType = 'image/png';
    else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
    else if (ext === '.jfif') contentType = 'image/jpeg';
    else if (ext === '.gif') contentType = 'image/gif';
    else if (ext === '.svg') contentType = 'image/svg+xml';
    else if (ext === '.ico') contentType = 'image/x-icon';

    // Serve file
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
    console.log(`===================================================`);
    console.log(`  Local Dev Server running at http://127.0.0.1:${PORT}/`);
    console.log(`  mimicking clean production URLs.`);
    console.log(`===================================================`);
});
