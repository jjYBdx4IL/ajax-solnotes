
//
// Utility functions
//

$.fn.centerOnScreen = function (centerHorizontally = true, centerVertically = true) {
  this.css("position", "fixed");
  if (centerHorizontally)
    this.css("left", Math.max(0, (($(window).width() - $(this).outerWidth()) / 2) +
      $(window).scrollLeft()) + "px");
  if (centerVertically)
    this.css("top", Math.max(0, (($(window).height() - $(this).outerHeight()) / 2) +
      $(window).scrollTop()) + "px");
  return this;
}


/** @param {number} length @returns {string} */
function makeid(length) {
  var result           = [];
  var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for ( var i = 0; i < length; i++ ) {
    result.push(characters.charAt(Math.floor(Math.random() * charactersLength)));
  }
  return result.join('');
}

const urlifyRegex = new RegExp("(((?:(http|https|Http|Https|rtsp|Rtsp):\\/\\/(?:(?:[a-zA-Z0-9\\$\\-\\_\\.\\+\\!\\*\\'\\(\\)"
+ "\\,\\;\\?\\&\\=]|(?:\\%[a-fA-F0-9]{2})){1,64}(?:\\:(?:[a-zA-Z0-9\\$\\-\\_"
+ "\\.\\+\\!\\*\\'\\(\\)\\,\\;\\?\\&\\=]|(?:\\%[a-fA-F0-9]{2})){1,25})?\\@)?)?"
+ "((?:(?:[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}\\.)+"   // named host
+ "(?:"   // plus top level domain
+ "(?:aero|arpa|asia|a[cdefgilmnoqrstuwxz])"
+ "|(?:biz|b[abdefghijmnorstvwyz])"
+ "|(?:cat|com|coop|c[acdfghiklmnoruvxyz])"
+ "|d[ejkmoz]"
+ "|(?:edu|e[cegrstu])"
+ "|f[ijkmor]"
+ "|(?:gov|g[abdefghilmnpqrstuwy])"
+ "|h[kmnrtu]"
+ "|(?:info|int|i[delmnoqrst])"
+ "|(?:jobs|j[emop])"
+ "|k[eghimnrwyz]"
+ "|l[abcikrstuvy]"
+ "|(?:mil|mobi|museum|m[acdghklmnopqrstuvwxyz])"
+ "|(?:name|net|n[acefgilopruz])"
+ "|(?:org|om)"
+ "|(?:pro|p[aefghklmnrstwy])"
+ "|qa"
+ "|r[eouw]"
+ "|s[abcdeghijklmnortuvyz]"
+ "|(?:tel|travel|t[cdfghjklmnoprtvwz])"
+ "|u[agkmsyz]"
+ "|v[aceginu]"
+ "|w[fs]"
+ "|y[etu]"
+ "|z[amw]))"
+ "|(?:(?:25[0-5]|2[0-4]" // or ip address
+ "[0-9]|[0-1][0-9]{2}|[1-9][0-9]|[1-9])\\.(?:25[0-5]|2[0-4][0-9]"
+ "|[0-1][0-9]{2}|[1-9][0-9]|[1-9]|0)\\.(?:25[0-5]|2[0-4][0-9]|[0-1]"
+ "[0-9]{2}|[1-9][0-9]|[1-9]|0)\\.(?:25[0-5]|2[0-4][0-9]|[0-1][0-9]{2}"
+ "|[1-9][0-9]|[0-9])))"
+ "(?:\\:\\d{1,5})?)" // plus option port number
+ "(\\/(?:(?:[a-zA-Z0-9\\;\\/\\?\\:\\@\\&\\=\\#\\~"  // plus option query params
+ "\\-\\.\\+\\!\\*\\'\\(\\)\\,\\_])|(?:\\%[a-fA-F0-9]{2}))*)?"
+ "(?:\\b|$))", "g");  
/** @param {string} text  @returns {string} */
function urlify(text) {
  return text.replaceAll(urlifyRegex, '<div class="link">$1</a>');
}
//console.log("test:"+urlify("https://www.google.de http://www.bla.de"));
const deurlifyRegex = new RegExp("<div class=\"link\">([^<>]+)</div>", "g");
/** @param {string} text  @returns {string} */
function deurlify(text) {
  return text.replaceAll(deurlifyRegex, '$1');
}
//console.log("test:"+deurlify(urlify("https://www.google.de http://www.bla.de")));



