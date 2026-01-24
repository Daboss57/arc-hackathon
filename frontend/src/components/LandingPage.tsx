import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });

  const heroOpacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const heroScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);
  const heroY = useTransform(scrollYProgress, [0, 0.5], [0, 50]);

  const features = [
    {
      icon: '🤖',
      title: 'AI-Powered Agents',
      description: 'Autonomous agents handle purchases, compare vendors, and optimize spending—all within your defined policies.',
    },
    {
      icon: '🛡️',
      title: 'Policy Guardrails',
      description: 'Set spending limits, vendor rules, and category restrictions. Your agent works within boundaries you control.',
    },
    {
      icon: '⚡',
      title: 'x402 Payments',
      description: 'Native HTTP 402 payment protocol for instant, programmable micropayments on Base network.',
    },
    {
      icon: '📊',
      title: 'Real-time Analytics',
      description: 'Track every transaction, monitor budget utilization, and get AI-powered spending recommendations.',
    },
  ];

  return (
    <div className="landing">
      {/* Navigation */}
      <nav className="landing-nav">
        <div className="landing-nav-brand">
          <span className="landing-logo">◈</span>
          <span className="landing-logo-text">ARC</span>
        </div>
        <div className="landing-nav-links">
          <a href="#features">Features</a>
          <a href="#how-it-works">How it Works</a>
          <a href="#security">Security</a>
        </div>
        <button className="btn btn-primary" onClick={onGetStarted}>
          Get Started
        </button>
      </nav>

      {/* Hero Section */}
      <section ref={heroRef} className="landing-hero">

        <motion.div
          className="landing-hero-content"
          style={{ opacity: heroOpacity, scale: heroScale, y: heroY }}
        >
          <motion.div
            className="landing-badge"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <span className="landing-badge-dot" />
            Built on Base • x402 Protocol
          </motion.div>

          <motion.h1
            className="landing-title"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            Autonomous Treasury
            <br />
            <span className="landing-title-accent">Management</span>
          </motion.h1>

          <motion.p
            className="landing-subtitle"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            Give your AI agents the power to spend—safely. Policy-controlled wallets, 
            real-time oversight, and programmable payments for the autonomous economy.
          </motion.p>

          <motion.div
            className="landing-cta-group"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            <button className="btn btn-primary btn-lg btn-glow" onClick={onGetStarted}>
              Start Building
              <span className="btn-arrow">→</span>
            </button>
            <button className="btn btn-ghost btn-lg">
              View Documentation
            </button>
          </motion.div>
        </motion.div>

        <motion.div
          className="landing-hero-visual"
          initial={{ opacity: 0, y: 60, rotateX: 15 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ delay: 0.6, duration: 0.8, ease: "easeOut" }}
        >
          <div className="landing-demo-card">
            <div className="landing-demo-header">
              <div className="landing-demo-dots">
                <span /><span /><span />
              </div>
              <span className="landing-demo-title">Agent Activity</span>
            </div>
            <div className="landing-demo-content">
              <motion.div
                className="landing-demo-message"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 }}
              >
                <span className="landing-demo-avatar">🤖</span>
                <div className="landing-demo-bubble">
                  <p>Found 3 vendors for cloud hosting. Comparing prices...</p>
                </div>
              </motion.div>
              <motion.div
                className="landing-demo-message"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.1 }}
              >
                <span className="landing-demo-avatar">🤖</span>
                <div className="landing-demo-bubble">
                  <p>Selected DigitalOcean at $48/mo (32% savings). Executing payment via x402...</p>
                </div>
              </motion.div>
              <motion.div
                className="landing-demo-action"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.3 }}
              >
                <span className="landing-demo-check">✓</span>
                <div>
                  <strong>Payment Complete</strong>
                  <span>0.02 ETH • Policy: cloud-infra • 0.8s</span>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features with Glowing Effect */}
      <section className="landing-features" id="features">
        <div className="landing-section-header">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            Built for Autonomous Commerce
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            Everything you need to let AI agents handle financial operations—with full control and visibility.
          </motion.p>
        </div>
        <div className="landing-features-grid">
          {features.map((feature, i) => (
            <motion.div
              key={i}
              className="landing-feature-card"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
            >
              <div className="landing-feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section className="landing-steps" id="how-it-works">
        <div className="landing-section-header">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            How It Works
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Three steps to autonomous treasury management.
          </motion.p>
        </div>
        <div className="landing-steps-list">
          {[
            {
              num: '01',
              title: 'Define Policies',
              desc: 'Set spending limits, approved vendors, and category budgets. Your rules, enforced automatically.',
            },
            {
              num: '02',
              title: 'Fund Your Wallet',
              desc: 'Deposit USDC to your Circle-powered smart wallet on Base. Fully non-custodial.',
            },
            {
              num: '03',
              title: 'Let Agents Work',
              desc: 'Your AI agents execute transactions within policy bounds. Real-time receipts and analytics.',
            },
          ].map((step, i) => (
            <motion.div
              key={i}
              className="landing-step"
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15 }}
            >
              <div className="landing-step-number">{step.num}</div>
              <div className="landing-step-content">
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Security */}
      <section className="landing-security" id="security">
        <motion.div
          className="landing-security-content"
          initial={{ opacity: 0, x: -40 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <h2>Enterprise-Grade Security</h2>
          <p>Your funds are protected by multiple layers of security and policy enforcement.</p>
          <ul className="landing-security-list">
            <li>
              <span className="landing-security-icon">🔐</span>
              <div>
                <strong>Non-custodial Wallets</strong>
                <span>Circle MPC wallets—you control the keys</span>
              </div>
            </li>
            <li>
              <span className="landing-security-icon">📜</span>
              <div>
                <strong>Policy Engine</strong>
                <span>Every transaction validated against your rules</span>
              </div>
            </li>
            <li>
              <span className="landing-security-icon">🔍</span>
              <div>
                <strong>Full Audit Trail</strong>
                <span>Complete transaction history with on-chain receipts</span>
              </div>
            </li>
            <li>
              <span className="landing-security-icon">⚠️</span>
              <div>
                <strong>Anomaly Detection</strong>
                <span>AI-powered monitoring for suspicious patterns</span>
              </div>
            </li>
          </ul>
        </motion.div>
        <motion.div
          className="landing-security-visual"
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <div className="landing-shield">
            <div className="landing-shield-glow" />
            <div className="landing-shield-ring" />
            <div className="landing-shield-ring" />
            <div className="landing-shield-ring" />
            <span className="landing-shield-icon">🛡️</span>
          </div>
        </motion.div>
      </section>

      {/* CTA */}
      <section className="landing-final-cta">
        <div className="landing-cta-content">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            Ready to automate your treasury?
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            Start building with ARC today. Free to get started.
          </motion.p>
          <motion.button
            className="btn btn-primary btn-lg btn-glow"
            onClick={onGetStarted}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            Create Free Account
            <span className="btn-arrow">→</span>
          </motion.button>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="landing-footer-brand">
          <span className="landing-logo">◈</span>
          <span>ARC Protocol</span>
        </div>
        <div className="landing-footer-links">
          <a href="#">Documentation</a>
          <a href="#">GitHub</a>
          <a href="#">Twitter</a>
        </div>
        <div className="landing-footer-copy">
          © 2025 ARC Protocol. Built for the autonomous economy.
        </div>
      </footer>
    </div>
  );
}
