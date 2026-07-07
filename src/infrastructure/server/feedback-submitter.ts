const GOOGLE_FORM_RESPONSE_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSdQ7D8vweIA798viydmvW37Yj_aMAMZSvKsIX3SvoZ9bGEUfA/formResponse";
const GOOGLE_FORM_NAME_ENTRY = "entry.1054141803";
const GOOGLE_FORM_MESSAGE_ENTRY = "entry.131084111";

export async function submitFeedbackToGoogleForm(input: {
  nickname: string;
  message: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(GOOGLE_FORM_RESPONSE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body: buildGoogleFormBody(input),
  });

  if (!response.ok) {
    return { ok: false, error: await response.text() };
  }

  return { ok: true };
}

function buildGoogleFormBody(input: {
  nickname: string;
  message: string;
}): string {
  const params = new URLSearchParams();
  params.set(GOOGLE_FORM_NAME_ENTRY, input.nickname);
  params.set(GOOGLE_FORM_MESSAGE_ENTRY, input.message);
  return params.toString();
}
