/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: [
    'firebase-admin',
    '@google-cloud/firestore',
    '@google-cloud/storage',
    'google-auth-library',
    'google-gax',
    'gaxios',
    'teeny-request',
    'protobufjs',
    'node-forge',
  ],
};

export default nextConfig;
