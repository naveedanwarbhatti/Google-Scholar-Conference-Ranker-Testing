// types.ts

// REMOVED 'export' from all of these.
interface SuccessResponse {
  status: 'success';
  selfCitations: number;
  totalCitations: number;
  percentage: number;
}

interface ErrorResponse {
  status: 'error';
  message: string;
}

type ApiResponse = SuccessResponse | ErrorResponse;

interface CacheEntry {
  data: ApiResponse;
  timestamp: number;
}