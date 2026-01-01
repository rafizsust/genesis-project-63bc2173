import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Available Edge TTS voices with accents
const EDGE_TTS_VOICES = {
  US: [
    "en-US-AriaNeural",
    "en-US-JennyNeural",
    "en-US-GuyNeural",
    "en-US-DavisNeural",
  ],
  GB: [
    "en-GB-SoniaNeural",
    "en-GB-RyanNeural",
    "en-GB-LibbyNeural",
    "en-GB-ThomasNeural",
  ],
  AU: [
    "en-AU-NatashaNeural",
    "en-AU-WilliamNeural",
  ],
  IN: [
    "en-IN-NeerjaNeural",
    "en-IN-PrabhatNeural",
  ],
};

const ALL_ACCENTS = Object.keys(EDGE_TTS_VOICES) as Array<keyof typeof EDGE_TTS_VOICES>;

function getRandomVoice(preferredAccent?: string): { voiceId: string; accent: string } {
  let accent: keyof typeof EDGE_TTS_VOICES;
  
  if (preferredAccent && preferredAccent !== "random" && preferredAccent !== "mixed" && EDGE_TTS_VOICES[preferredAccent as keyof typeof EDGE_TTS_VOICES]) {
    accent = preferredAccent as keyof typeof EDGE_TTS_VOICES;
  } else {
    accent = ALL_ACCENTS[Math.floor(Math.random() * ALL_ACCENTS.length)];
  }
  
  const voices = EDGE_TTS_VOICES[accent];
  const voiceId = voices[Math.floor(Math.random() * voices.length)];
  return { voiceId, accent };
}

function getVoiceForMixedAccent(index: number, quantity: number): { voiceId: string; accent: string } {
  // Distribute accents evenly across tests
  const accentIndex = index % ALL_ACCENTS.length;
  const accent = ALL_ACCENTS[accentIndex];
  const voices = EDGE_TTS_VOICES[accent];
  const voiceId = voices[Math.floor(Math.random() * voices.length)];
  return { voiceId, accent };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify admin status
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: adminCheck } = await supabase
      .from("admin_users")
      .select("id")
      .eq("user_id", user.id)
      .single();

    if (!adminCheck) {
      return new Response(JSON.stringify({ error: "Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { module, topic, difficulty, quantity, accent } = await req.json();

    // Validate inputs
    if (!module || !topic || !difficulty || !quantity) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["listening", "speaking", "reading", "writing"].includes(module)) {
      return new Response(JSON.stringify({ error: "Invalid module" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!["easy", "medium", "hard"].includes(difficulty)) {
      return new Response(JSON.stringify({ error: "Invalid difficulty" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (quantity < 1 || quantity > 20) {
      return new Response(JSON.stringify({ error: "Quantity must be 1-20" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create the job record
    const { data: job, error: jobError } = await supabase
      .from("bulk_generation_jobs")
      .insert({
        admin_user_id: user.id,
        module,
        topic,
        difficulty,
        quantity,
        status: "pending",
      })
      .select()
      .single();

    if (jobError) {
      console.error("Failed to create job:", jobError);
      return new Response(JSON.stringify({ error: "Failed to create job" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Start background processing (fire and forget)
    processGenerationJob(supabase, job.id, module, topic, difficulty, quantity, accent).catch(console.error);

    return new Response(
      JSON.stringify({
        success: true,
        jobId: job.id,
        message: `Started generating ${quantity} ${module} tests for topic "${topic}"`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("bulk-generate-tests error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function processGenerationJob(
  supabase: any,
  jobId: string,
  module: string,
  topic: string,
  difficulty: string,
  quantity: number,
  accentPreference?: string
) {
  console.log(`[Job ${jobId}] Starting generation of ${quantity} ${module} tests`);

  // Update job status to processing
  await supabase
    .from("bulk_generation_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", jobId);

  let successCount = 0;
  let failureCount = 0;
  const errorLog: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < quantity; i++) {
    try {
      console.log(`[Job ${jobId}] Processing test ${i + 1}/${quantity}`);
      
      // Get voice based on accent preference
      const { voiceId, accent } = accentPreference === "mixed" 
        ? getVoiceForMixedAccent(i, quantity)
        : getRandomVoice(accentPreference);
      
      // Generate content based on module
      const content = await generateContent(module, topic, difficulty);
      
      if (!content) {
        throw new Error("Content generation failed");
      }

      // For listening and speaking, generate audio
      let audioUrl: string | null = null;
      let sampleAudioUrl: string | null = null;

      if (module === "listening" || module === "speaking") {
        try {
          audioUrl = await generateAndUploadAudio(
            content.script || content.questions?.map((q: any) => q.text).join(" "),
            voiceId,
            jobId,
            i
          );

          // For speaking, also generate sample answer audio
          if (module === "speaking" && content.sampleAnswers) {
            sampleAudioUrl = await generateAndUploadAudio(
              content.sampleAnswers,
              voiceId,
              jobId,
              i,
              "_sample"
            );
          }
        } catch (audioError) {
          console.error(`[Job ${jobId}] Audio generation failed for test ${i + 1}:`, audioError);
          // Audio failed - DISCARD this test per requirements
          throw new Error(`Audio generation failed: ${audioError instanceof Error ? audioError.message : "Unknown"}`);
        }
      }

      // Save to generated_test_audio table
      const testData = {
        job_id: jobId,
        module,
        topic,
        difficulty,
        voice_id: voiceId,
        accent,
        content_payload: content,
        audio_url: audioUrl,
        sample_audio_url: sampleAudioUrl,
        transcript: content.script || null,
        status: audioUrl ? "ready" : "content_only",
        is_published: false,
      };

      const { error: insertError } = await supabase
        .from("generated_test_audio")
        .insert(testData);

      if (insertError) {
        throw new Error(`Database insert failed: ${insertError.message}`);
      }

      successCount++;
      console.log(`[Job ${jobId}] Successfully created test ${i + 1}`);

      // Update progress
      await supabase
        .from("bulk_generation_jobs")
        .update({ success_count: successCount, failure_count: failureCount })
        .eq("id", jobId);

    } catch (error) {
      failureCount++;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      errorLog.push({ index: i, error: errorMessage });
      console.error(`[Job ${jobId}] Failed test ${i + 1}:`, errorMessage);

      // Update progress
      await supabase
        .from("bulk_generation_jobs")
        .update({ 
          success_count: successCount, 
          failure_count: failureCount,
          error_log: errorLog,
        })
        .eq("id", jobId);
    }

    // Small delay between generations to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Mark job as completed
  await supabase
    .from("bulk_generation_jobs")
    .update({
      status: failureCount === quantity ? "failed" : "completed",
      success_count: successCount,
      failure_count: failureCount,
      error_log: errorLog,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  console.log(`[Job ${jobId}] Completed: ${successCount} success, ${failureCount} failed`);
}

async function generateContent(module: string, topic: string, difficulty: string) {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  const prompts: Record<string, string> = {
    listening: `Generate an IELTS ${difficulty} difficulty Listening test about "${topic}".

Include:
1. A natural dialogue or monologue script (300-500 words) with natural pauses marked as "..." or [pause]
2. 10 questions based on the script (mix of multiple choice, fill-in-blank, matching)
3. Answer keys for all questions

Format as JSON:
{
  "script": "The full script with natural pauses...",
  "questions": [
    { "number": 1, "type": "multiple_choice", "text": "Question text", "options": ["A", "B", "C", "D"], "answer": "B" }
  ]
}`,

    speaking: `Generate an IELTS ${difficulty} difficulty Speaking test about "${topic}".

Include natural pauses in questions using "..." or [pause 1s].

Format as JSON:
{
  "part1": {
    "questions": ["Question 1...", "Question 2..."],
    "sampleAnswers": ["Sample answer 1", "Sample answer 2"]
  },
  "part2": {
    "cueCard": "Describe a [topic]...\nYou should say:\n- point 1\n- point 2\n- point 3",
    "sampleAnswer": "A model answer..."
  },
  "part3": {
    "questions": ["Discussion question 1...", "Discussion question 2..."],
    "sampleAnswers": ["Sample answer 1", "Sample answer 2"]
  },
  "sampleAnswers": "Combined sample answers for TTS"
}`,

    reading: `Generate an IELTS ${difficulty} difficulty Reading passage about "${topic}".

Include:
1. A passage (600-900 words) suitable for academic reading
2. 13 questions (mix of True/False/Not Given, matching headings, fill-in-blank)
3. Answer keys

Format as JSON:
{
  "title": "Passage title",
  "passage": "The full passage text...",
  "questions": [
    { "number": 1, "type": "tfng", "text": "Statement", "answer": "TRUE" }
  ]
}`,

    writing: `Generate an IELTS ${difficulty} difficulty Writing task about "${topic}".

Include:
1. Task 1: A data description task (chart/graph/diagram description)
2. Task 2: An essay question
3. Model answers for both

Format as JSON:
{
  "task1": {
    "instruction": "The chart below shows...",
    "description": "Description of what to analyze",
    "modelAnswer": "A band 8-9 sample answer..."
  },
  "task2": {
    "instruction": "Some people believe that... To what extent do you agree or disagree?",
    "modelAnswer": "A band 8-9 sample essay..."
  }
}`,
  };

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "You are an expert IELTS test creator. Generate high-quality, authentic exam content. Always respond with valid JSON only, no markdown.",
        },
        { role: "user", content: prompts[module] },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`AI generation failed: ${response.status}`);
  }

  const data = await response.json();
  const contentText = data.choices?.[0]?.message?.content;

  if (!contentText) {
    throw new Error("Empty AI response");
  }

  // Parse JSON from response (handle potential markdown wrapping)
  let jsonContent = contentText;
  if (contentText.includes("```json")) {
    jsonContent = contentText.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  }

  return JSON.parse(jsonContent.trim());
}

async function generateAndUploadAudio(
  text: string,
  voiceId: string,
  jobId: string,
  index: number,
  suffix: string = ""
): Promise<string> {
  // Use Edge TTS via a dedicated edge function or direct API
  // For now, we'll use the Lovable AI TTS capability
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  // Clean text for TTS
  const cleanText = text
    .replace(/\[pause\s*\d*s?\]/gi, "...")
    .replace(/\n+/g, " ")
    .trim();

  // Generate audio using Gemini TTS or external TTS service
  // For Microsoft Edge TTS, we need to use edge-tts library
  // Since we can't use npm packages directly, we'll use a TTS API
  
  // Fallback: Use Lovable AI for now, with proper SSML-like pauses
  const response = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "tts-1",
      input: cleanText,
      voice: voiceId.toLowerCase().includes("aria") ? "alloy" 
           : voiceId.toLowerCase().includes("guy") ? "onyx"
           : voiceId.toLowerCase().includes("jenny") ? "nova"
           : voiceId.toLowerCase().includes("ryan") ? "echo"
           : "alloy",
      response_format: "mp3",
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS generation failed: ${response.status} - ${errorText}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioBytes = new Uint8Array(audioBuffer);

  // Upload to R2
  const { uploadToR2 } = await import("../_shared/r2Client.ts");
  const key = `generated-tests/${jobId}/${index}${suffix}.mp3`;
  
  const uploadResult = await uploadToR2(key, audioBytes, "audio/mpeg");
  
  if (!uploadResult.success || !uploadResult.url) {
    throw new Error(uploadResult.error || "R2 upload failed");
  }

  return uploadResult.url;
}
