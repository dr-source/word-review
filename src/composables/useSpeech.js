/**
 * Web Speech API 封装 composable
 */
export function useSpeech() {
  function speak(text, isUk = false) {
    if (!window.speechSynthesis) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = isUk ? 'en-GB' : 'en-US'
    utterance.rate = 0.9
    speechSynthesis.speak(utterance)
  }

  return { speak }
}
