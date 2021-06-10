/**
 * Generates a pseudo-random string of a length of 6.
 * @return {string} 
 */
export function randomString() {
  return Math.random().toString(36).substr(2, 6);
}
