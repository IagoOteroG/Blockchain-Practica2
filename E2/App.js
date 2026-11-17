
import React, { useState } from "react";
import { create } from "kubo-rpc-client";
import { ethers } from "ethers";
import { addresses, abis } from "./contracts";
import "./App.css";

const ipfs = create({
  url: "http://127.0.0.1:5001/api/v0"
});

function App() {
  const [archivo, setArchivo] = useState(null);
  const [cid, setCid] = useState("");
  const [cidConsulta, setCidConsulta] = useState("");
  const [estado, setEstado] = useState("");
  const [resultado, setResultado] = useState("");
  const [txHash, setTxHash] = useState("");
  const [procesando, setProcesando] = useState(false);

  async function obtenerContrato(firma = false) {
    if (!window.ethereum) {
      throw new Error("MetaMask no está disponible");
    }

    const provider = new ethers.providers.Web3Provider(
      window.ethereum
    );

    await provider.send("eth_requestAccounts", []);

    const network = await provider.getNetwork();

    if (network.chainId !== 11155111) {
      throw new Error("Selecciona la red Sepolia");
    }

    return new ethers.Contract(
      addresses.ipfs,
      abis.ipfs,
      firma ? provider.getSigner() : provider
    );
  }

  async function registrar(e) {
    e.preventDefault();

    if (!archivo) {
      setEstado("Selecciona un archivo");
      return;
    }

    setProcesando(true);
    setResultado("");
    setTxHash("");

    try {
      setEstado("Subiendo certificado a IPFS...");

      const contenido = new Uint8Array(
        await archivo.arrayBuffer()
      );

      const respuesta = await ipfs.add(contenido);
      const hash = respuesta.cid.toString();

      try {
        await ipfs.files.cp(
          `/ipfs/${hash}`,
          `/${hash}`
        );
      } catch (error) {
        // Si ya existe en Files, continuamos.
        if (!/already exists|file exists/i.test(error.message)) {
          throw error;
        }
      }

      setCid(hash);
      setCidConsulta(hash);

      setEstado("Esperando confirmación de MetaMask...");

      const contrato = await obtenerContrato(true);
      const tx = await contrato.registrarCertificado(hash);

      setTxHash(tx.hash);
      await tx.wait();

      setEstado("Certificado registrado correctamente");

    } catch (error) {
      console.error(error);
      setEstado("Error: " + (error.reason || error.message));
    } finally {
      setProcesando(false);
    }
  }

  async function verificar() {
    if (!cidConsulta.trim()) return;

    try {
      const contrato = await obtenerContrato();

      const valido = await contrato.verificarCertificado(
        cidConsulta.trim()
      );

      const datos = await contrato.consultarCertificado(
        cidConsulta.trim()
      );

      if (valido) {
        setResultado("CERTIFICADO VÁLIDO");
      } else if (datos.revocado) {
        setResultado("CERTIFICADO REVOCADO");
      } else {
        setResultado("CERTIFICADO NO REGISTRADO");
      }

    } catch (error) {
      setResultado("Error: " + (error.reason || error.message));
    }
  }

  async function revocar() {
    if (!cidConsulta.trim()) return;

    setProcesando(true);

    try {
      const contrato = await obtenerContrato(true);

      const tx = await contrato.revocarCertificado(
        cidConsulta.trim()
      );

      setTxHash(tx.hash);
      await tx.wait();

      setResultado("CERTIFICADO REVOCADO");
      setEstado("Revocación confirmada en Sepolia");

    } catch (error) {
      setEstado("Error: " + (error.reason || error.message));
    } finally {
      setProcesando(false);
    }
  }

  return (
    <div className="App" style={{ padding: "40px" }}>
      <h1>Registro de Certificados Académicos</h1>
      <p>Almacenamiento IPFS + Ethereum Sepolia</p>

      <hr />

      <h2>1. Registrar certificado</h2>

      <form onSubmit={registrar}>
        <input
          type="file"
          onChange={(e) => setArchivo(e.target.files[0])}
        />

        <button type="submit" disabled={procesando}>
          Registrar certificado
        </button>
      </form>

      {cid && (
        <p>
          <strong>CID:</strong> {cid}
        </p>
      )}

      <hr />

      <h2>2. Verificar certificado</h2>

      <input
        type="text"
        value={cidConsulta}
        onChange={(e) => setCidConsulta(e.target.value)}
        placeholder="Introduce el CID del certificado"
        style={{ width: "450px", maxWidth: "90%" }}
      />

      <div style={{ marginTop: "15px" }}>
        <button onClick={verificar} disabled={procesando}>
          Verificar
        </button>

        <button
          onClick={revocar}
          disabled={procesando}
          style={{ marginLeft: "10px" }}
        >
          Revocar certificado
        </button>
      </div>

      {resultado && <h3>{resultado}</h3>}

      <hr />

      <p>{estado}</p>

      {txHash && (
        <p>
          <a
            href={`https://sepolia.etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
          >
            Ver transacción en Etherscan
          </a>
        </p>
      )}
    </div>
  );
}

export default App;
