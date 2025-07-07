# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-07-07

### Added
- TypeScript implementation for JSClient components
- Type safety throughout the payment processing client
- ES2022 module support with proper imports/exports
- TypeScript configuration (`tsconfig.json`) with strict type checking
- Automatic TypeScript compilation in build process
- Source map generation for debugging support

### Changed
- **BREAKING**: Converted `JSClient/src/index.js` to TypeScript (`index.ts`)
- **BREAKING**: Converted `JSClient/src/payment.js` to TypeScript (`payment.ts`)
- Updated build scripts to include TypeScript compilation
- Enhanced event handling with proper type definitions
- Improved browser module loading with ES modules

### Technical Details
- Uses existing Twilio Sync type definitions (no custom interfaces)
- PaymentClient extends EventTarget with proper typing
- Maintains backward compatibility with existing HTML onclick handlers
- Automatic compilation from TypeScript to JavaScript during build/deployment

### Migration Notes
- No breaking changes to the API or functionality
- All existing server endpoints and client interactions remain the same
- HTML files updated to use ES modules (`type="module"`)
- Build process now includes TypeScript compilation step

## [1.0.0] - Previous Release
- Initial JavaScript implementation
- Payment processing with Twilio integration
- Automatic payment capture logic
- Sync service integration