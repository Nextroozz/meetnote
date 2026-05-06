import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const SUMMARY_PROMPT = `Tu es un assistant expert en synthèse de réunions professionnelles.
À partir de la transcription suivante, génère un résumé structuré en JSON avec exactement ce format :
{
  "key_points": ["point 1", "point 2", ...],
  "decisions": ["décision 1", ...],
  "actions": [
    { "task": "tâche", "owner": "prénom ou null", "deadline": "date ou null" }
  ],
  "duration_minutes": number
}
Réponds UNIQUEMENT avec le JSON, sans texte autour.`;

serve(async (req) => {
  try {
    const { meeting_id } = await req.json();

    // 1. Récupérer la réunion et les participants
    const { data: meeting } = await supabase
      .from('meetings')
      .select('*')
      .eq('id', meeting_id)
      .single();

    if (!meeting) throw new Error('Meeting not found');

    const { data: participants } = await supabase
      .from('participants')
      .select('email')
      .eq('meeting_id', meeting_id);

    // 2. Télécharger l'audio depuis Storage
    const { data: audioData } = await supabase.storage
      .from('meeting-audios')
      .download(meeting.audio_path);

    if (!audioData) throw new Error('Audio not found');

    // 3. Transcription via Whisper
    const audioBlob = new Blob([await audioData.arrayBuffer()], { type: 'audio/m4a' });
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.m4a');
    formData.append('model', 'whisper-1');
    formData.append('language', 'fr');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: formData,
    });
    const { text: transcript } = await whisperRes.json();

    // 4. Résumé via GPT-4o
    const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: transcript },
        ],
        response_format: { type: 'json_object' },
      }),
    });
    const gptData = await gptRes.json();
    const summary = JSON.parse(gptData.choices[0].message.content);
    summary.participant_count = participants?.length ?? 0;

    // 5. Sauvegarder transcript + résumé
    await supabase.from('meetings').update({
      transcript,
      summary,
      status: 'done',
    }).eq('id', meeting_id);

    // 6. Envoyer les emails via Resend
    if (participants && participants.length > 0) {
      const emailBody = buildEmailHtml(meeting.name, summary);

      await Promise.all(participants.map(async (p) => {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'MeetNote <noreply@meetnote.app>',
            to: p.email,
            subject: `Résumé : ${meeting.name}`,
            html: emailBody,
          }),
        });
        await supabase.from('participants')
          .update({ email_sent: true })
          .eq('meeting_id', meeting_id)
          .eq('email', p.email);
      }));
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('process-meeting error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function buildEmailHtml(meetingName: string, summary: any): string {
  const keyPoints = summary.key_points?.map((p: string) => `<li>${p}</li>`).join('') ?? '';
  const decisions = summary.decisions?.map((d: string) => `<li>${d}</li>`).join('') ?? '';
  const actions = summary.actions?.map((a: any) =>
    `<li><strong>${a.task}</strong>${a.owner ? ` — ${a.owner}` : ''}${a.deadline ? ` (${a.deadline})` : ''}</li>`
  ).join('') ?? '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
    .card { background: white; border-radius: 16px; max-width: 560px; margin: 0 auto; padding: 32px; }
    .logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
    .logo-mark { width: 36px; height: 36px; background: #6366F1; border-radius: 10px; }
    .logo-name { font-weight: 700; font-size: 18px; color: #111; }
    h1 { font-size: 22px; font-weight: 700; color: #111; margin: 0 0 6px; }
    .meta { color: #8E8E93; font-size: 14px; margin-bottom: 28px; }
    h2 { font-size: 14px; font-weight: 600; color: #6366F1; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 10px; }
    ul { margin: 0; padding-left: 20px; color: #333; line-height: 1.7; }
    .footer { text-align: center; color: #8E8E93; font-size: 12px; margin-top: 32px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <div class="logo-mark"></div>
      <span class="logo-name">MeetNote</span>
    </div>
    <h1>${meetingName}</h1>
    <p class="meta">Résumé généré par l'IA · ${summary.participant_count ?? 0} participant${(summary.participant_count ?? 0) > 1 ? 's' : ''}</p>

    ${keyPoints ? `<h2>Points clés</h2><ul>${keyPoints}</ul>` : ''}
    ${decisions ? `<h2>Décisions prises</h2><ul>${decisions}</ul>` : ''}
    ${actions ? `<h2>Actions à faire</h2><ul>${actions}</ul>` : ''}

    <p class="footer">Envoyé automatiquement par MeetNote</p>
  </div>
</body>
</html>`;
}
