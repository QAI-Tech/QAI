# Nebula - AI-Powered Web App Testing Platform

Nebula is a modern frontend web application designed to streamline and automate web application testing. It allows users to upload Figma frames/screenshots and execute automated tests to validate their applications using AI-powered test case generation.

## Features

- **Product Management**

  - Select and manage products from the side navigation bar
  - View product-specific test cases and test runs
  - Add new products to your organization

- **AI-Powered Test Planning**

  - Upload Figma frames or screenshots
  - Generate test cases automatically using AI
  - Plan smoke tests and feature-specific test cases
  - Support for multiple test types (Smoke, UI, Action, Route, Obstruction)

- **Test Case Management**

  - View and organize test cases by feature
  - Add test cases manually or through AI generation
  - Edit existing test cases with detailed steps and expected results
  - Attach screenshots and visual references
  - Export test cases to Excel sheets

- **Test Run Execution**

  - Create and manage test runs
  - Track test execution status in real-time
  - View detailed test results and failure analysis
  - Upload failure videos and add notes
  - Monitor test metrics and statistics

- **User Authentication**
  - Secure login and signup using Clerk
  - Role-based access control
  - Organization-level product management

## Tech Stack

- **Framework**: Next.js 14 with React
- **Styling**: TailwindCSS with ShadCN UI components
- **State Management**: React Redux
- **Form Handling**: React Hook Form with Zod validation
- **Authentication**: Clerk
- **UI Components**:
  - Framer Motion for animations
  - Embla Carousel for slideshows
  - React Day Picker for date selection
  - Recharts for data visualization
- **Cloud Storage**: Google Cloud Storage
- **Notifications**: Sonner for toast messages

## Getting Started

### Prerequisites

- Node.js 18 or later
- npm or yarn
- Google Cloud Storage account
- Clerk account for authentication

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd nebula
```

2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Set up environment variables:

```bash
cp .env.example .env.local
```

Fill in the following environment variables:

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
GOOGLE_CLOUD_PROJECT_ID=
GOOGLE_CLOUD_PRIVATE_KEY=
GOOGLE_CLOUD_CLIENT_EMAIL=

4. Start the development server:

```bash
npm run dev
# or
yarn dev
```

The application will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
npm start
# or
yarn build
yarn start
```

## Docker Support

Build and run the application using Docker:

```bash
docker build --build-arg NODE_ENV=production \ -t nebula .
docker run -p 3000:3000 nebula
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

# Development

npm install # Install dependencies
npm run dev # Start development server

# Production

npm run build # Build for production
npm start # Start production server

# Docker

docker build -t nebula . # Build Docker image
docker run -p 3000:3000 nebula # Run Docker container

# Additional Commands

npm run lint # Run ESLint
npm run format # Run Prettier
npm run type-check # Run TypeScript type checking
