import axios from 'axios';

export function getErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.detail || error.message || 'Something went wrong.';
  }

  return 'Something went wrong.';
}
