import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { idToken } = await req.json();

    if (!idToken) {
      return new Response(
        JSON.stringify({ error: "Missing idToken" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const channelId = Deno.env.get("LINE_CHANNEL_ID");

    if (!channelId) {
      throw new Error("LINE_CHANNEL_ID is missing");
    }

    const body = new URLSearchParams();
    body.set("id_token", idToken);
    body.set("client_id", channelId);

    const verifyRes = await fetch(
      "https://api.line.me/oauth2/v2.1/verify",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      }
    );

    if (!verifyRes.ok) {
      const detail = await verifyRes.text();

      return new Response(
        JSON.stringify({
          error: "Invalid LINE ID token",
          detail,
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const lineProfile = await verifyRes.json();

    const lineUserId = lineProfile.sub;
    const displayName = lineProfile.name ?? null;
    const pictureUrl = lineProfile.picture ?? null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("line_users")
      .upsert(
        {
          line_user_id: lineUserId,
          display_name: displayName,
          picture_url: pictureUrl,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "line_user_id",
        }
      )
      .select()
      .single();

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        user: data,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});