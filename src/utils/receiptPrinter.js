// Sends the "Get a Serial Number" ticket straight to the network thermal
// receipt printer via ESC/POS (raw TCP, port 9100 by default) — this is
// the standard way receipt printers are driven, and unlike the browser's
// window.print(), it doesn't depend on any OS print dialog or kiosk-mode
// browser flag (--kiosk-printing turned out to be unreliable across
// Chrome versions during testing).
//
// A printer being unset, offline, or unreachable never blocks issuing a
// ticket — the patient still gets their number either way; only the
// physical print is skipped, with the reason logged server-side.
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');

async function printTicket({ ticketNumber, counterName, serviceName, hospitalName = 'Queens Hospital' }) {
  if (!process.env.PRINTER_IP) return;

  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: `tcp://${process.env.PRINTER_IP}:${process.env.PRINTER_PORT || 9100}`,
    options: { timeout: 5000 }
  });

  try {
    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      console.error(`Receipt printer not reachable at ${process.env.PRINTER_IP}:${process.env.PRINTER_PORT || 9100} — ticket was still issued.`);
      return;
    }

    printer.alignCenter();
    printer.bold(true);
    printer.println(hospitalName);
    printer.bold(false);
    printer.println(new Date().toLocaleString());
    printer.drawLine();

    printer.println('Your Serial Number');
    printer.setTextSize(2, 2);
    printer.println(ticketNumber);
    printer.setTextNormal();
    printer.println(`${counterName} - ${serviceName}`);

    printer.drawLine();
    printer.println('Please wait to be called');
    printer.cut();

    await printer.execute();
  } catch (err) {
    console.error('Error printing ticket (ticket was still issued):', err.message);
  }
}

module.exports = { printTicket };
