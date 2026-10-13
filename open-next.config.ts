import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Every page is dynamic (session cookie), so no incremental cache is configured.
export default defineCloudflareConfig({});
