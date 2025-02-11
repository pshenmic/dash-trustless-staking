export const validateEnvVars = (requiredVars) => {
  return requiredVars.forEach((varName) => {
    if (!process.env[varName]) {
      throw new Error(`${varName} not set in environment`);
    }
  });
};
