import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseCdcCrt } from "../../../src/modules/accrochage/crt-parser";

describe("CDC processing report parser", () => {
  it("correlates passagesOK and passagesKO by idTechnique", () => {
    const source = `<?xml version="1.0" encoding="UTF-8"?>
      <cdc:accuse xmlns:cdc="urn:test">
        <cdc:passagesKO>
          <cdc:passage><cdc:idTechnique>item-rejected</cdc:idTechnique>
          <cdc:messageErreur>CDC.42: Nom &amp; référence invalides</cdc:messageErreur></cdc:passage>
        </cdc:passagesKO>
        <cdc:passagesOK><cdc:passage><cdc:idTechnique>item-accepted</cdc:idTechnique></cdc:passage></cdc:passagesOK>
      </cdc:accuse>`;

    assert.deepEqual(parseCdcCrt(source), [
      { idTechnique: "item-accepted", accepted: true },
      {
        idTechnique: "item-rejected",
        accepted: false,
        code: "CDC.42",
        reason: "CDC.42: Nom & référence invalides",
      },
    ]);
  });

  it("uses an explicit codeErreur when present", () => {
    const source = `<accuse><passagesKO><passage><idTechnique>x</idTechnique><codeErreur>E_1</codeErreur><messageErreur><![CDATA[Une erreur <métier>]]></messageErreur></passage></passagesKO></accuse>`;
    assert.deepEqual(parseCdcCrt(source), [
      { idTechnique: "x", accepted: false, code: "E_1", reason: "Une erreur <métier>" },
    ]);
  });

  it("rejects DTDs, entities, duplicate references and malformed XML", () => {
    assert.throws(() =>
      parseCdcCrt("<!DOCTYPE x [<!ENTITY leak SYSTEM 'file:///etc/passwd'>]><x />"),
    );
    assert.throws(() =>
      parseCdcCrt("<x><passagesOK><idTechnique>&unknown;</idTechnique></passagesOK></x>"),
    );
    assert.throws(() =>
      parseCdcCrt("<x><passagesOK><idTechnique>&#x110000;</idTechnique></passagesOK></x>"),
    );
    assert.throws(() =>
      parseCdcCrt("<x><passagesOK><idTechnique>&#x1F;</idTechnique></passagesOK></x>"),
    );
    assert.throws(() =>
      parseCdcCrt("<x><passagesOK><idTechnique>&#xFFFE;</idTechnique></passagesOK></x>"),
    );
    assert.throws(() =>
      parseCdcCrt("<x><passagesOK><idTechnique>bad\u001fvalue</idTechnique></passagesOK></x>"),
    );
    assert.throws(() =>
      parseCdcCrt("<x><passagesOK><idTechnique>a</idTechnique><idTechnique>a</idTechnique></passagesOK></x>"),
    );
    assert.throws(() => parseCdcCrt("<x><passagesOK></x>"));
  });

  it("requires a reason for every rejected passage", () => {
    assert.throws(() =>
      parseCdcCrt("<x><passagesKO><idTechnique>a</idTechnique></passagesKO></x>"),
    );
  });
});
