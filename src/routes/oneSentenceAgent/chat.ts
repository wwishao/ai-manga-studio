import express, { Request, Response } from "express";
import u from "@/utils";

const router = express.Router();

router.post("/expand", async (req: Request, res: Response) => {
  try {
    const { idea } = req.body;
    if (!idea) { res.status(400).json({ error: "请输入创意描述" }); return; }
    const skill = u.getPath("skills") + "/oneSentence_skills/story_expander.md";
    const prompt = require("fs").readFileSync(skill, "utf-8");
    const streamResult: any = await u.Ai.Text("universalAi").stream({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "请将以下创意扩写为故事大纲：\\n\\n" + idea },
      ],
    });
    let text = "";
    for await (const chunk of streamResult.fullStream) {
      if (chunk.type === "text-delta" && chunk.textDelta) {
        text += chunk.textDelta;
      }
    }
    let outline;
    try { outline = JSON.parse(text.replace(/[`]{3}json\\n?/g, "").trim()); }
    catch { outline = { raw: text }; }
    res.json({ success: true, data: outline });
  } catch (err: any) {
    res.status(500).json({ error: u.error(err).message });
  }
});

router.post("/quick-generate", async (req: Request, res: Response) => {
  try {
    const { idea, artStyle, outputType } = req.body;
    if (!idea) { res.status(400).json({ error: "请输入创意描述" }); return; }
    const skill = u.getPath("skills") + "/oneSentence_skills/story_expander.md";
    const prompt = require("fs").readFileSync(skill, "utf-8");
    const streamResult: any = await u.Ai.Text("universalAi").stream({
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: "请将以下创意扩写为故事大纲：\\n\\n" + idea },
      ],
    });
    let outlineText = "";
    for await (const chunk of streamResult.fullStream) {
      if (chunk.type === "text-delta" && chunk.textDelta) {
        outlineText += chunk.textDelta;
      }
    }
    let outline;
    try { outline = JSON.parse(outlineText.replace(/[`]{3}json\\n?/g, "").trim()); }
    catch { res.status(500).json({ error: "故事扩写失败" }); return; }
    const style = artStyle || "日系动漫";
    const outType = outputType || "漫剧";
    const [projectId] = await u.db("o_project").insert({
      name: outline.title, type: outType, artStyle: style,
      intro: outline.logline, status: "active",
    });
    for (let i = 0; i < outline.scenes.length; i++) {
      const scene = outline.scenes[i];
      await u.db("o_novel").insert({
        projectId, chapterIndex: i + 1, chapter: scene.name,
        chapterData: scene.description, location: scene.location || "",
        event: scene.description, characters: (scene.characters || []).join(","),
        eventState: "pending",
      });
    }
    if (outline.characters) {
      for (const char of outline.characters) {
        await u.db("o_assets").insert({
          projectId, name: char.name, type: "role",
          desc: (char.type || "配角") + " - " + (char.personality || ""),
          prompt: char.appearance || "", state: "confirmed",
        });
      }
    }
    res.json({ success: true, data: { projectId, title: outline.title, scenes: outline.scenes.length, message: "项目已创建" } });
  } catch (err: any) {
    res.status(500).json({ error: u.error(err).message });
  }
});

export default router;
