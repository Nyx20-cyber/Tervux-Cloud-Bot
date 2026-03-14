/** @type {import('next').NextConfig} */
const backendBase = process.env.BACKEND_URL || "http://localhost:5000";

const nextConfig = {
    images: {
        remotePatterns: [
            {
                protocol: "https",
                hostname: "habarileo.co.tz",
                pathname: "/wp-content/uploads/**"
            }
        ]
    },
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: `${backendBase}/api/:path*`,
            },
            {
                source: '/socket.io/:path*',
                destination: `${backendBase}/socket.io/:path*`,
            }
        ];
    },
};

export default nextConfig;
