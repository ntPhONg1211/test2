const apiUrl = process.env.API_HEALTH_URL || "http://localhost:3000/api/health";
const timeoutMs = 30000;
const retryMs = 250;
const startedAt = Date.now();

async function waitForApi() {
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(apiUrl);
      const status = response.status;
      if (response.ok) {
        console.log(`API health check OK: ${status} ${apiUrl}`);
        process.exit(0);
      }
      console.warn(`API chưa sẵn sàng (${status}) tại ${apiUrl}. Đang chờ khởi động...`);
    } catch (error) {
      console.warn(`API chưa sẵn sàng tại ${apiUrl}: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, retryMs));
  }

  console.error(`API không phản hồi tại ${apiUrl} sau ${timeoutMs / 1000} giây.`);
  process.exit(1);
}

waitForApi();
