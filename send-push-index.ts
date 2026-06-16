import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if(req.method === "OPTIONS"){
    return new Response("ok", { headers:corsHeaders });
  }

  try{
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com";

    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const payload = await req.json();

    const toUser = payload.to_user;
    const title = payload.title || "Pager";
    const body = payload.body || "New message";
    const url = payload.url || "./index.html";

    if(!toUser){
      return new Response(JSON.stringify({ error:"to_user is required" }), {
        status:400,
        headers:{ ...corsHeaders, "Content-Type":"application/json" }
      });
    }

    const { data: subscriptions, error } = await supabase
      .from("pager_push_subscriptions")
      .select("*")
      .eq("username", toUser);

    if(error){
      throw error;
    }

    const results = [];

    for(const row of subscriptions || []){
      try{
        await webpush.sendNotification(
          row.subscription,
          JSON.stringify({ title, body, url })
        );

        results.push({ endpoint:row.endpoint, ok:true });
      }catch(error){
        results.push({ endpoint:row.endpoint, ok:false, error:String(error) });

        if(error && (error.statusCode === 404 || error.statusCode === 410)){
          await supabase
            .from("pager_push_subscriptions")
            .delete()
            .eq("endpoint", row.endpoint);
        }
      }
    }

    return new Response(JSON.stringify({ ok:true, sent:results.length, results }), {
      headers:{ ...corsHeaders, "Content-Type":"application/json" }
    });
  }catch(error){
    return new Response(JSON.stringify({ error:String(error) }), {
      status:500,
      headers:{ ...corsHeaders, "Content-Type":"application/json" }
    });
  }
});
