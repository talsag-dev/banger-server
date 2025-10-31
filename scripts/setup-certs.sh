#!/bin/bash

# Create certs directory if it doesn't exist
mkdir -p certs

# Generate a private key
openssl genrsa -out certs/localhost-key.pem 2048

# Generate a certificate signing request
openssl req -new -key certs/localhost-key.pem -out certs/localhost.csr -subj "/C=US/ST=CA/L=San Francisco/O=Banger Dev/OU=Development/CN=localhost"

# Generate a self-signed certificate
openssl x509 -req -in certs/localhost.csr -signkey certs/localhost-key.pem -out certs/localhost-cert.pem -days 365 -extensions v3_req -extfile <(
cat <<EOF
[v3_req]
keyUsage = critical, digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = localhost
DNS.2 = *.localhost
IP.1 = 127.0.0.1
IP.2 = ::1
EOF
)

# Clean up the CSR file
rm certs/localhost.csr

echo "✅ SSL certificates generated successfully!"
echo "📁 Certificates saved to:"
echo "   - certs/localhost-key.pem (private key)"
echo "   - certs/localhost-cert.pem (certificate)"
echo ""
echo "⚠️  Important: You'll need to accept the self-signed certificate in your browser"
echo "   when you first visit https://localhost:3001"