const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);
const fs = require('fs');
const path = require('path');
const mongoose = require('../simpleback/node_modules/mongoose');
const { createStrapi } = require('@strapi/strapi');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://lightyagami98k:UN1cr0DnJwISvvgs@cluster0.uwkswmj.mongodb.net/cyber?retryWrites=true&w=majority&appName=Cluster0';

async function runMigration() {
  console.log('🚀 Starting migration of all blogs to Strapi...');

  // 1. Fetch blogs from MongoDB
  console.log('📦 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  const MongoBlog = mongoose.model('Blog', new mongoose.Schema({}, { strict: false }));
  const mongoBlogs = await MongoBlog.find({}).lean();
  console.log(`✅ Found ${mongoBlogs.length} blogs in MongoDB.`);

  // 2. Prepare static blogs
  const staticBlogs = [
    {
      title: 'ISO 27001:2022 Implementation Guide for Startups and SMEs',
      slug: 'iso-27001-2022-implementation-guide-startups-smes',
      excerpt: 'A practical, zero-fluff blueprint for startups and SMEs achieving ISO/IEC 27001:2022 ISMS certification, Annex A controls, SOA, and audit readiness without slowing growth.',
      category: 'GRC & Security',
      content: '<p>A practical, zero-fluff blueprint for startups and SMEs achieving ISO/IEC 27001:2022 ISMS certification, Annex A controls, SOA, and audit readiness without slowing growth.</p>',
      publishedAt: new Date('2026-03-08T00:00:00.000Z'),
      featuredImage: null,
      authorName: 'CyberAtrix GRC Team',
      readTime: 12,
      metaTitle: 'ISO 27001:2022 Implementation Guide for Startups and SMEs | CyberAtrix',
      metaDescription: 'A practical blueprint for startups and SMEs achieving ISO 27001:2022 ISMS certification and audit readiness.'
    },
    {
      title: 'How to Do an ISO 27001 Risk Assessment: Step-by-Step Guide',
      slug: 'iso-27001-risk-assessment-step-by-step-v5',
      excerpt: 'Step-by-step practical guide to ISO 27001 risk assessment. Learn how to define scope, identify assets, threats and vulnerabilities.',
      category: 'GRC & Security',
      content: '<p>Step-by-step practical guide to ISO 27001 risk assessment. Learn how to define scope, identify assets, threats and vulnerabilities.</p>',
      publishedAt: new Date('2026-09-18T00:00:00.000Z'),
      unsplashImage: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=800&q=80',
      authorName: 'CyberAtrix Team',
      readTime: 10,
      metaTitle: 'How to Do an ISO 27001 Risk Assessment: Step-by-Step Guide | CyberAtrix',
      metaDescription: 'Step-by-step practical guide to ISO 27001 risk assessment. Learn how to define scope, identify assets, threats and vulnerabilities.'
    },
    {
      title: 'ISO 27001 Policies: The Complete ISMS Guide',
      slug: 'cyberatrix-iso-27001-policies-isms-complete-guide',
      excerpt: 'A complete guide to ISO 27001 policies and Information Security Management System (ISMS) implementation.',
      category: 'GRC & Security',
      content: '<p>A complete guide to ISO 27001 policies and Information Security Management System (ISMS) implementation.</p>',
      publishedAt: new Date('2026-09-18T00:00:00.000Z'),
      unsplashImage: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&q=80',
      authorName: 'CyberAtrix Team',
      readTime: 15,
      metaTitle: 'ISO 27001 Policies: The Complete ISMS Guide | CyberAtrix',
      metaDescription: 'A complete guide to ISO 27001 policies and Information Security Management System (ISMS) implementation.'
    }
  ];

  // Combine blogs list, preferring mongoBlogs if duplicate slugs
  const allBlogsToMigrate = [...mongoBlogs];
  for (const sb of staticBlogs) {
    if (!allBlogsToMigrate.some(b => b.slug === sb.slug)) {
      allBlogsToMigrate.push(sb);
    }
  }

  // 3. Load Strapi
  console.log('⚡ Initializing Strapi instance...');
  const app = await createStrapi({ distDir: './dist' }).load();

  // 4. Ensure Public permissions
  console.log('🔒 Configuring Public permissions for Blog...');
  try {
    const publicRole = await app.query('plugin::users-permissions.role').findOne({ where: { type: 'public' } });
    if (publicRole) {
      const existingPerms = await app.query('plugin::users-permissions.permission').findMany({ where: { role: publicRole.id } });
      const actions = ['api::blog.blog.find', 'api::blog.blog.findOne'];
      for (const action of actions) {
        if (!existingPerms.some(p => p.action === action)) {
          await app.query('plugin::users-permissions.permission').create({
            data: { action, role: publicRole.id }
          });
          console.log(`  + Granted public permission: ${action}`);
        }
      }
    }
  } catch (err) {
    console.warn('  ⚠️ Note on permissions:', err.message);
  }

  // 5. Fetch existing Strapi blogs
  const existingStrapiBlogs = await app.documents('api::blog.blog').findMany({ limit: 100 });
  const existingMap = new Map();
  existingStrapiBlogs.forEach(b => {
    if (b.slug) existingMap.set(b.slug, b);
  });
  console.log(`📋 Strapi currently has ${existingStrapiBlogs.length} blogs.`);

  // 6. Migrate each blog
  let migratedCount = 0;
  let updatedCount = 0;

  for (const b of allBlogsToMigrate) {
    if (!b.title || !b.slug) continue;

    const blogData = {
      title: b.title.trim(),
      slug: b.slug.trim(),
      excerpt: b.excerpt || '',
      content: b.content || b.excerpt || '',
      category: b.category || 'Cybersecurity',
      featuredImage: b.featuredImage || '',
      unsplashImage: b.unsplashImage || (b.featuredImage && b.featuredImage.startsWith('http') ? b.featuredImage : ''),
      metaTitle: b.metaTitle || b.title,
      metaDescription: b.metaDescription || b.excerpt || '',
      keywords: b.keywords || '',
      authorName: b.authorName || 'CyberAtrix Team',
      readTime: b.readTime || 5,
      views: b.views || 0,
    };

    const existing = existingMap.get(blogData.slug);

    if (existing) {
      console.log(`  🔄 Updating existing blog: "${blogData.title}" (${blogData.slug})`);
      await app.documents('api::blog.blog').update({
        documentId: existing.documentId,
        data: blogData,
        status: 'published'
      });
      updatedCount++;
    } else {
      console.log(`  ➕ Creating blog: "${blogData.title}" (${blogData.slug})`);
      await app.documents('api::blog.blog').create({
        data: blogData,
        status: 'published'
      });
      migratedCount++;
    }
  }

  console.log('\n==========================================');
  console.log(`🎉 Migration Completed Successfully!`);
  console.log(`Total blogs processed: ${allBlogsToMigrate.length}`);
  console.log(`Newly created: ${migratedCount}`);
  console.log(`Updated: ${updatedCount}`);
  console.log('==========================================');

  await mongoose.disconnect();
  process.exit(0);
}

runMigration().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
