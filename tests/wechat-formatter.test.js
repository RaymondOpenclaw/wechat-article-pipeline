import test from "node:test";
import assert from "node:assert/strict";
import { formatWechatHtml, stripUnsupportedWechatHtml } from "../src/core/wechatFormatter.js";

test("formatWechatHtml strips unsupported tags and applies inline styles", () => {
  const html = formatWechatHtml(`
    <style>p{color:red}</style>
    <script>alert(1)</script>
    <h2 onclick="bad()">小标题</h2>
    <p>这一段很长。它需要适合手机阅读。它不应该带脚本。它也应该被拆成更舒服的节奏。它继续变长。它还在继续变长。它已经超过限制了。</p>
    <img src="cover.png" width="900" height="383">
  `);
  assert.doesNotMatch(html, /<script|<style|onclick/i);
  assert.match(html, /data-role="wechat-article"/);
  assert.match(html, /<h2 style="/);
  assert.match(html, /<img src="cover\.png" style="max-width:100%/);
});

test("stripUnsupportedWechatHtml removes external styles and event attributes", () => {
  const html = stripUnsupportedWechatHtml('<link rel="stylesheet"><p onload="x()">正文</p>');
  assert.equal(html, "<p>正文</p>");
});

test("formatWechatHtml preserves intentional inline paragraph styles", () => {
  const html = formatWechatHtml('<p style="color:#5c451f;font-weight:600;">金句</p>');
  assert.match(html, /color:#5c451f/);
  assert.match(html, /font-weight:600/);
});
