// CHROMIUM_ANGLE=gl selects the system OpenGL device for matching hardware reference captures.
export const launchOptions = {
  executablePath: process.env.CHROMIUM,
  args: process.env.CHROMIUM_ANGLE === 'gl'
    ? ['--enable-gpu', '--use-gl=angle', '--use-angle=gl', ...(process.platform === 'linux' ? ['--ozone-platform=x11'] : [])]
    : ['--enable-unsafe-swiftshader'],
};
