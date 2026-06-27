import tempfile
import unittest
from pathlib import Path

from app.banking import BankSandbox


class BankSandboxTests(unittest.TestCase):
    def make_sandbox(self) -> BankSandbox:
        tmp = tempfile.TemporaryDirectory()
        sandbox = BankSandbox(Path(tmp.name) / "bank.sqlite")
        self.addCleanup(tmp.cleanup)
        self.addCleanup(sandbox.close)
        return sandbox

    def test_transfer_requires_confirmation(self):
        sandbox = self.make_sandbox()
        before = sandbox.one("SELECT available FROM accounts WHERE id = ?", ("acc-usd",))["available"]

        result = sandbox.run_command("Ogluma 100 dolar yolla")

        self.assertIn("onay", result["message"].lower())
        self.assertIsNotNone(result["state"]["pendingConfirmation"])
        after = sandbox.one("SELECT available FROM accounts WHERE id = ?", ("acc-usd",))["available"]
        self.assertEqual(before, after)

    def test_confirm_transfer_moves_sandbox_balance_once(self):
        sandbox = self.make_sandbox()
        pending = sandbox.run_command("Ogluma 100 dolar yolla")["state"]["pendingConfirmation"]
        before = sandbox.one("SELECT available FROM accounts WHERE id = ?", ("acc-usd",))["available"]

        confirmed = sandbox.confirm(pending["id"], True)
        after = sandbox.one("SELECT available FROM accounts WHERE id = ?", ("acc-usd",))["available"]
        second = sandbox.confirm(pending["id"], True)

        self.assertIn("gonderildi", confirmed["message"].lower())
        self.assertEqual(before - 100, after)
        self.assertIn("gecerli", second["message"].lower())

    def test_balance_command(self):
        sandbox = self.make_sandbox()
        result = sandbox.run_command("Bakiyelerimi goster")

        self.assertIn("sandbox", result["message"].lower())
        self.assertGreaterEqual(len(result["state"]["accounts"]), 1)


if __name__ == "__main__":
    unittest.main()
