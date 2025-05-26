import { Request, Response } from "express";
import RentalModel from "../models/rentalModel";
import mongoose from "mongoose";

// Função para calcular o número de dias entre duas datas
const calculateDays = (startDate: Date, endDate: Date): number => {
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 para incluir o dia inicial
};

// Função para calcular o número de horas entre dois horários
const calculateHours = (startTime: string, endTime: string): number => {
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const [endHour, endMinute] = endTime.split(':').map(Number);
  
  let hours = endHour - startHour;
  let minutes = endMinute - startMinute;
  
  if (minutes < 0) {
    hours -= 1;
    minutes += 60;
  }
  
  return hours + (minutes / 60);
};

// Função para calcular o valor total da reserva
const calculateTotalValue = (
  startDate: Date,
  endDate: Date,
  startTime: string,
  endTime: string,
  hourlyRate: number
): number => {
  const days = calculateDays(startDate, endDate);
  const hoursPerDay = calculateHours(startTime, endTime);
  return days * hoursPerDay * hourlyRate;
};

// Função para verificar se há conflito de horário
const hasTimeConflict = (
  existingStartDate: Date,
  existingEndDate: Date,
  existingStartTime: string,
  existingEndTime: string,
  newStartDate: Date,
  newEndDate: Date,
  newStartTime: string,
  newEndTime: string
) => {
  // Se as datas não se sobrepõem, não há conflito
  if (newEndDate < existingStartDate || newStartDate > existingEndDate) {
    return false;
  }

  // Se for o mesmo dia, verifica o horário
  if (newStartDate.getTime() === newEndDate.getTime() && 
      existingStartDate.getTime() === existingEndDate.getTime() &&
      newStartDate.getTime() === existingStartDate.getTime()) {
    return (
      (newStartTime >= existingStartTime && newStartTime < existingEndTime) ||
      (newEndTime > existingStartTime && newEndTime <= existingEndTime) ||
      (newStartTime <= existingStartTime && newEndTime >= existingEndTime)
    );
  }

  // Se as datas se sobrepõem, há conflito
  return true;
};

// Função para converter data do formato YYYY-MM-DD para Date
const convertDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Função para gerar array de datas entre duas datas
const getDatesBetween = (startDate: Date, endDate: Date): Date[] => {
  const dates: Date[] = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    dates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return dates;
};

// Criar um novo aluguel com validação de conflito
export const createRental = async (req: Request, res: Response) => {
  try {
    const { userId, spaceId, start_date, end_date, startTime, endTime, value } = req.body;

    if (!userId || !spaceId || !start_date || !end_date || !startTime || !endTime || !value) {
      res.status(400).json({ error: "Todos os campos são obrigatórios." });
      return;
    }

    // Validar IDs
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(spaceId)
    ) {
      res.status(400).json({ error: "ID inválido." });
      return;
    }

    // Converter as datas para o formato correto
    const convertedStartDate = convertDate(start_date);
    const convertedEndDate = convertDate(end_date);

    // Verificar conflitos no mesmo espaço
    const rentalsOnSameSpace = await RentalModel.find({
      space: spaceId,
      $or: [
        {
          start_date: { $lte: convertedEndDate },
          end_date: { $gte: convertedStartDate }
        }
      ]
    });

    for (const rental of rentalsOnSameSpace) {
      if (
        hasTimeConflict(
          rental.start_date,
          rental.end_date,
          rental.startTime,
          rental.endTime,
          convertedStartDate,
          convertedEndDate,
          startTime,
          endTime
        )
      ) {
        res.status(409).json({
          error: "Conflito de horário: já existe um aluguel nesse espaço neste período.",
        });
        return;
      }
    }

    const rental = new RentalModel({
      user: userId,
      space: spaceId,
      start_date: convertedStartDate,
      end_date: convertedEndDate,
      startTime,
      endTime,
      value
    });

    await rental.save();
    res.status(201).json(rental);
    return;
  } catch (error: any) {
    console.error("Erro ao criar aluguel:", error);
    res.status(500).json({ 
      error: "Erro interno ao criar aluguel.",
      details: error.message 
    });
    return;
  }
};

// Listar todos os aluguéis com filtro opcional por data e espaço
export const getAllRentals = async (req: Request, res: Response) => {
  try {
    const { start_date, end_date, spaceId } = req.query;

    const filter: any = {};
    if (start_date) filter.start_date = { $gte: convertDate(start_date as string) };
    if (end_date) filter.end_date = { $lte: convertDate(end_date as string) };
    if (spaceId && mongoose.Types.ObjectId.isValid(spaceId as string)) {
      filter.space = spaceId;
    }

    const rentals = await RentalModel.find(filter)
      .populate("user", "name email")
      .populate("space", "name location");

    res.status(200).json(rentals);
    return;
  } catch (error: any) {
    console.error("Erro ao buscar aluguéis:", error);
    res.status(500).json({ 
      error: "Erro interno ao buscar aluguéis.",
      details: error.message 
    });
    return;
  }
};

// Listar aluguéis de um usuário específico
export const getRentalsByUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: "ID de usuário inválido." });
      return;
    }

    const rentals = await RentalModel.find({ user: userId })
      .populate("space", "space_name image_url price_per_hour location");

    res.status(200).json(rentals);
    return;
  } catch (error: any) {
    console.error("Erro ao buscar aluguéis do usuário:", error);
    res.status(500).json({ 
      error: "Erro interno ao buscar aluguéis.",
      details: error.message 
    });
    return;
  }
};

// Deletar aluguel pelo ID
export const deleteRental = async (req: Request, res: Response) => {
  try {
    const { rentalId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(rentalId)) {
      res.status(400).json({ error: "ID de aluguel inválido." });
      return;
    }

    const deleted = await RentalModel.findByIdAndDelete(rentalId);

    if (!deleted) {
      res.status(404).json({ error: "Aluguel não encontrado." });
      return;
    }

    res.status(200).json({ message: "Aluguel deletado com sucesso." });
    return;
  } catch (error: any) {
    console.error("Erro ao deletar aluguel:", error);
    res.status(500).json({ 
      error: "Erro interno ao deletar aluguel.",
      details: error.message 
    });
    return;
  }
};

// Listar todas as datas reservadas de um espaço específico
export const getRentedDatesBySpace = async (req: Request, res: Response) => {
  try {
    const { spaceId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(spaceId)) {
      res.status(400).json({ error: "ID de espaço inválido." });
      return;
    }

    const rentals = await RentalModel.find({ space: spaceId })
      .select('start_date end_date');

    if (!rentals.length) {
      res.status(200).json({ dates: [] });
      return;
    }

    // Gerar array com todas as datas reservadas
    const allRentedDates = rentals.reduce((dates: Date[], rental) => {
      const datesBetween = getDatesBetween(rental.start_date, rental.end_date);
      return [...dates, ...datesBetween];
    }, []);

    // Remover duplicatas e ordenar as datas
    const uniqueDates = [...new Set(allRentedDates.map(date => date.toISOString().split('T')[0]))]
      .sort();

    res.status(200).json({ dates: uniqueDates });
    return;
  } catch (error: any) {
    console.error("Erro ao buscar datas reservadas:", error);
    res.status(500).json({ 
      error: "Erro interno ao buscar datas reservadas.",
      details: error.message 
    });
    return;
  }
};
