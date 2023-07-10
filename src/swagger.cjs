module.exports = {
  openapi: '3.0.0',
  info: {
    // API information (required)
    title: 'Credential Service for cheqd network', // Title (required)
    version: '2.0.0', // Version (required)
    description: 'API service to create and manage DIDs and credentials on cheqd network.', // Description (optional)
  },
  tags: [
    {
      name: 'Credential',
      externalDocs: {
        url: 'https://github.com/cheqd/credential-service#readme'
      }
    }
  ],
  components: {}
};