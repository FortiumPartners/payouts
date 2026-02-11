/**
 * Validation Rules API routes.
 * CRUD for configurable bill validation rules + bill validation endpoint.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from './auth.js';
import {
  getAllRules,
  seedDefaultRules,
} from '../services/validation-rules.js';

const ruleTypeEnum = z.enum([
  'required_field',
  'amount_threshold',
  'approval_required',
  'duplicate_detection',
  'custom',
]);

const ruleSchema = z.object({
  id: z.string(),
  name: z.string(),
  ruleType: z.string(),
  conditions: z.record(z.unknown()),
  active: z.boolean(),
  priority: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createRuleSchema = z.object({
  name: z.string().min(1),
  ruleType: ruleTypeEnum,
  conditions: z.record(z.unknown()),
  active: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
});

const updateRuleSchema = z.object({
  name: z.string().min(1).optional(),
  ruleType: ruleTypeEnum.optional(),
  conditions: z.record(z.unknown()).optional(),
  active: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
});

export const validationRulesRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', requireAuth);

  /**
   * GET /api/rules - List all validation rules
   */
  fastify.get('/', {
    schema: {
      response: {
        200: z.object({ rules: z.array(ruleSchema) }),
      },
    },
  }, async () => {
    const rules = await getAllRules();
    return {
      rules: rules.map(r => ({
        ...r,
        conditions: r.conditions as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });

  /**
   * POST /api/rules - Create a new validation rule
   */
  fastify.post('/', {
    schema: {
      body: createRuleSchema,
      response: {
        201: ruleSchema,
      },
    },
  }, async (request, reply) => {
    const body = request.body as z.infer<typeof createRuleSchema>;

    // Check for duplicate name
    const existing = await prisma.validationRule.findUnique({
      where: { name: body.name },
    });
    if (existing) {
      return reply.status(409).send({
        error: 'A rule with this name already exists',
        statusCode: 409,
      });
    }

    const rule = await prisma.validationRule.create({
      data: {
        name: body.name,
        ruleType: body.ruleType,
        conditions: body.conditions,
        active: body.active,
        priority: body.priority,
      },
    });

    fastify.log.info({ ruleId: rule.id, name: rule.name }, 'Validation rule created');
    reply.status(201);
    return {
      ...rule,
      conditions: rule.conditions as Record<string, unknown>,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  });

  /**
   * PUT /api/rules/:id - Update a validation rule
   */
  fastify.put('/:id', {
    schema: {
      params: z.object({ id: z.string() }),
      body: updateRuleSchema,
      response: {
        200: ruleSchema,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as z.infer<typeof updateRuleSchema>;

    const existing = await prisma.validationRule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({
        error: 'Validation rule not found',
        statusCode: 404,
      });
    }

    // If name is changing, check for conflicts
    if (body.name && body.name !== existing.name) {
      const nameConflict = await prisma.validationRule.findUnique({
        where: { name: body.name },
      });
      if (nameConflict) {
        return reply.status(409).send({
          error: 'A rule with this name already exists',
          statusCode: 409,
        });
      }
    }

    const rule = await prisma.validationRule.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.ruleType !== undefined && { ruleType: body.ruleType }),
        ...(body.conditions !== undefined && { conditions: body.conditions }),
        ...(body.active !== undefined && { active: body.active }),
        ...(body.priority !== undefined && { priority: body.priority }),
      },
    });

    fastify.log.info({ ruleId: rule.id, name: rule.name }, 'Validation rule updated');
    return {
      ...rule,
      conditions: rule.conditions as Record<string, unknown>,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  });

  /**
   * DELETE /api/rules/:id - Delete a validation rule
   */
  fastify.delete('/:id', {
    schema: {
      params: z.object({ id: z.string() }),
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.validationRule.findUnique({ where: { id } });
    if (!existing) {
      return reply.status(404).send({
        error: 'Validation rule not found',
        statusCode: 404,
      });
    }

    await prisma.validationRule.delete({ where: { id } });

    fastify.log.info({ ruleId: id, name: existing.name }, 'Validation rule deleted');
    return { success: true };
  });

  /**
   * POST /api/rules/seed - Seed default rules (idempotent)
   */
  fastify.post('/seed', async () => {
    await seedDefaultRules();
    const rules = await getAllRules();
    return {
      message: 'Default rules seeded',
      count: rules.length,
      rules: rules.map(r => ({
        ...r,
        conditions: r.conditions as Record<string, unknown>,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });

};
