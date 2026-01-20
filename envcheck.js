export async function handler() {
  return {
    statusCode: 200,
    body: JSON.stringify({
      hasUrl: !!process.env.SUPABASE_URL,
      hasKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY
    })
  }
}
