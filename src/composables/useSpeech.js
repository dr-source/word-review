/**
 * Web Speech API 封装 composable
 */
export function useSpeech() {
  function speak(text, isUk = false, rate = 0.9) {
    if (!window.speechSynthesis) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = isUk ? 'en-GB' : 'en-US'
    utterance.rate = rate
    speechSynthesis.speak(utterance)
  }

  return { speak }
}
