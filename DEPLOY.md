# Vercel 部署指南

## 部署步骤

### 1. 准备 GitHub 仓库

```bash
# 在项目目录下执行
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/cp-ranking.git
git push -u origin main
```

### 2. 在 Vercel 部署

1. 访问 https://vercel.com 并注册/登录
2. 点击「Add New Project」
3. 选择「Import Git Repository」
4. 选择你的 GitHub 仓库
5. 框架预设选择 **Next.js**
6. 点击「Deploy」

### 3. 配置环境变量

部署前需要在 Vercel 项目设置中添加环境变量：

1. 进入项目 → **Settings** → **Environment Variables**
2. 添加以下两个变量：
   - `COZE_SUPABASE_URL` = `https://你的项目ID.supabase.co`
   - `COZE_SUPABASE_ANON_KEY` = `你的anon_key`
3. 保存后重新部署

### 4. 获取 Supabase 凭证

你的 Supabase 凭证可以在扣子编程的项目设置中找到，或者从当前的 `.env` 文件中获取。

## 部署后的链接

Vercel 会给你一个稳定的链接，格式类似：
`https://你的项目名.vercel.app`

这个链接是永久稳定的，不会像沙箱环境那样偶尔打不开。

## 注意事项

- Vercel 免费版每月有 100GB 带宽限制，对于 CP 排行榜来说完全够用
- 数据库（Supabase）是独立的，不受 Vercel 影响
- 每次推送到 GitHub 会自动触发重新部署
