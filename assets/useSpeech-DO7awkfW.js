function c(){function n(s,t=!1){if(!window.speechSynthesis)return;const e=new SpeechSynthesisUtterance(s);e.lang=t?"en-GB":"en-US",e.rate=.9,speechSynthesis.speak(e)}return{speak:n}}export{c as u};
