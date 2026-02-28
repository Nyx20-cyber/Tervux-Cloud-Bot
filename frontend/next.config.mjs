/** @type {import('next').NextConfig} */
const nextConfig = {
    async rewrites() {
        return [
            {
                source: '/api/:path*',
                destination: 'http://localhost:5000/api/:path*', // Proxy to Backend
            },
            {
                source: '/socket.io/:path*',
                destination: 'http://localhost:5000/socket.io/:path*', // Proxy Socket.IO
            }
        ];
    },
};

export default nextConfig;
