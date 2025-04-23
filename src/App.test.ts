import { expect } from "jsr:@std/expect";
import { newApp } from "./App.ts";

const genericApp = <Entity extends object>() => {
  const app = newApp<Entity>({
    initializeEntity: (e) => {
      const proxy = new Proxy(e as Entity, {
        set: (target, prop, value) => {
          if (target[prop as keyof Entity] === value) return true;
          target[prop as keyof Entity] = value;
          app.queueEntityChange(proxy, prop as keyof Entity);
          return true;
        },
        deleteProperty: (target, prop) => {
          delete target[prop as keyof Entity];
          app.queueEntityChange(proxy, prop as keyof Entity);
          return true;
        },
      });
      return proxy;
    },
  });
  return app;
};

Deno.test("entities are not invalidated within onAdd", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    onAdd: (e) => {
      e.bar = true;
      expect(e.foo).toBe(true);
    },
  });
  app.addSystem({ props: ["bar"], onAdd: (e) => delete e.foo });

  const entity = app.addEntity({ foo: true });

  expect(entity).toEqual({ bar: true });
});

Deno.test("entities are not invalidated within update", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  const fooSystem = app.addSystem({
    props: ["foo"],
    update: () => {
      const e = fooSystem.entities.values().next().value!;
      e.bar = true;
      expect(e.foo).toBe(true);
    },
  });
  app.addSystem({ props: ["bar"], onAdd: (e) => delete e.foo });

  const entity = app.addEntity({ foo: true });
  app.update();

  expect(entity).toEqual({ bar: true });
});

Deno.test("entities are not invalidated within updateChild", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    updateEntity: (e) => {
      e.bar = true;
      expect(e.foo).toBe(true);
    },
  });
  app.addSystem({ props: ["bar"], onAdd: (e) => delete e.foo });

  const entity = app.addEntity({ foo: true });
  app.update();

  expect(entity).toEqual({ bar: true });
});

Deno.test("changes can be queued until changes are flushed", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    updateEntity: (e) => {
      e.bar = true;
      expect(e.foo).toBe(true);
      app.enqueue(() => {
        e.bar = false;
        expect(e.foo).toBeUndefined();
      });
    },
  });
  app.addSystem({
    props: ["bar"],
    onAdd: (e) => delete e.foo,
  });

  const entity = app.addEntity({ foo: true });
  app.update();

  expect(entity).toEqual({ bar: false });
});

Deno.test("entities are not invalidated within delete and are not temporarily added to other systems", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    onRemove: (e) => {
      e.bar = true;
      expect(e.foo).toBe(true);
    },
  });
  app.addSystem({ props: ["bar"], onAdd: (e) => delete e.foo });

  const entity = app.addEntity({ foo: true });

  app.removeEntity(entity);

  expect(entity).toEqual({ foo: true, bar: true });
});

Deno.test("entities are not invalidated within queueEntityChange", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    onChange: (e) => {
      e.bar = false;
      expect(e.foo).toBe(false);
    },
  });
  app.addSystem({
    props: ["bar"],
    onChange: (e) => delete e.foo,
  });

  const entity = app.addEntity<Entity>({ bar: true, foo: true });
  entity.foo = false;

  expect(entity).toEqual({ bar: false });
});

Deno.test("entity onAdd skipped if invalidated", () => {
  type Entity = { foo?: boolean; bar?: boolean; baz?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    onAdd: (e) => {
      delete e.bar;
      expect(e.baz).toBeUndefined();
    },
  });
  app.addSystem({
    props: ["foo", "bar"],
    onAdd: (e) => e.baz = true,
  });

  const entity = app.addEntity<Entity>({ bar: true });
  entity.foo = true;

  expect(entity).toEqual({ foo: true });
});

Deno.test("entities are not invalidated within addSystem", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    onChange: (e) => delete e.bar,
  });

  const entity = app.addEntity<Entity>({ bar: true, foo: true });

  app.addSystem({
    props: ["bar"],
    onAdd: (e) => {
      e.foo = false;
      expect(e.bar).toBe(true);
    },
  });

  expect(entity).toEqual({ foo: false });
});

Deno.test("entities are not invalidated within deleteSystem", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    onChange: (e) => delete e.bar,
  });
  const barSystem = app.addSystem({
    props: ["bar"],
    onRemove: (e) => {
      e.foo = false;
      expect(e.bar).toBe(true);
    },
  });

  const entity = app.addEntity<Entity>({ bar: true, foo: true });

  app.removeSystem(barSystem);

  expect(entity).toEqual({ foo: false });
});

Deno.test("entity cannot be invalidated by another entity's add", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    onAdd: (e) => {
      app.addEntity({ bar: true });
      expect(e.foo).toBe(true);
    },
  });
  app.addSystem({
    props: ["bar"],
    onAdd: () => {
      for (const entity of app.entities) {
        if (entity.foo) delete entity.foo;
      }
    },
  });

  const entity = app.addEntity<Entity>({ foo: true });

  expect(entity).toEqual({});
});

Deno.test("entity cannot be invalidated by another entity's removal", () => {
  type Entity = { foo?: boolean; bar?: boolean };
  const app = genericApp<Entity>();
  app.addSystem({
    props: ["foo"],
    onAdd: (e) => {
      app.removeEntity(toRemove);
      expect(e.foo).toBe(true);
    },
  });
  app.addSystem({
    props: ["bar"],
    onRemove: () => {
      for (const entity of app.entities) {
        if (entity.foo) delete entity.foo;
      }
    },
  });

  const toRemove = app.addEntity({ bar: true });
  const entity = app.addEntity<Entity>({ foo: true });

  expect(entity).toEqual({});
});
