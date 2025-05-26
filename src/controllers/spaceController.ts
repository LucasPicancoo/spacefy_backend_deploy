import { Request, Response } from "express";
import SpaceModel from "../models/spaceModel";
import { AMENITIES, ALLOWED_AMENITIES } from "../constants/amenities";
import { ALLOWED_RULES } from "../constants/spaceRules";
import mongoose from 'mongoose';
import { GoogleMapsService } from "../services/googleMapsService";

// import { AuthenticationData } from "../types/auth";

// Listar todos os espaços
export const getAllSpaces = async (req: Request, res: Response) => {
  try {
    const spaces = await SpaceModel.find();

    if (!spaces) {
      res.status(404).json({ error: "Nenhum espaço encontrado" });
      return;
    }

    res.status(200).json(spaces);
    return;
  } catch (error: any) {
    console.error("Erro ao listar espaços:", error);
    res.status(500).json({ 
      error: "Erro ao listar espaços",
      details: error.message 
    });
    return;
  }
};

// Obter um espaço por ID
export const getSpaceById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const space = await SpaceModel.findById(id);

    if (!space) {
      res.status(404).json({ error: "Espaço não encontrado" });
      return;
    }

    res.status(200).json(space);
    return;
  } catch (error: any) {
    console.error("Erro ao buscar espaço:", error);
    res.status(500).json({ 
      error: "Erro ao buscar espaço",
      details: error.message 
    });
    return;
  }
};



// Verificar como sera feito a busca por localizacao

// Buscar espaços com filtros
export const getSpacesWithFilters = async (req: Request, res: Response) => {
  try {
    const {
      space_type,
      min_price,
      max_price,
      min_area,
      max_area,
      min_people,
      amenities,
      space_rules,
      week_days,
      order_by
    } = req.query;

    // Construir o objeto de filtro
    const filter: any = {};

    // Validação do tipo de espaço
    if (space_type) {
      if (typeof space_type !== 'string') {
        res.status(400).json({ error: "O tipo de espaço deve ser uma string" });
        return;
      }
      filter.space_type = space_type;
    }

    // Validação de preço
    if (min_price || max_price) {
      filter.price_per_hour = {};
      
      if (min_price) {
        const minPriceNum = Number(min_price);
        if (isNaN(minPriceNum) || minPriceNum < 0) {
          res.status(400).json({ error: "O preço mínimo deve ser um número positivo" });
          return;
        }
        filter.price_per_hour.$gte = minPriceNum;
      }
      
      if (max_price) {
        const maxPriceNum = Number(max_price);
        if (isNaN(maxPriceNum) || maxPriceNum < 0) {
          res.status(400).json({ error: "O preço máximo deve ser um número positivo" });
          return;
        }
        if (min_price && maxPriceNum < Number(min_price)) {
          res.status(400).json({ error: "O preço máximo deve ser maior que o preço mínimo" });
          return;
        }
        filter.price_per_hour.$lte = maxPriceNum;
      }
    }

    // Validação de área
    if (min_area || max_area) {
      filter.area = {};
      
      if (min_area) {
        const minAreaNum = Number(min_area);
        if (isNaN(minAreaNum) || minAreaNum < 0) {
          res.status(400).json({ error: "A área mínima deve ser um número positivo" });
          return;
        }
        filter.area.$gte = minAreaNum;
      }
      
      if (max_area) {
        const maxAreaNum = Number(max_area);
        if (isNaN(maxAreaNum) || maxAreaNum < 0) {
          res.status(400).json({ error: "A área máxima deve ser um número positivo" });
          return;
        }
        if (min_area && maxAreaNum < Number(min_area)) {
          res.status(400).json({ error: "A área máxima deve ser maior que a área mínima" });
          return;
        }
        filter.area.$lte = maxAreaNum;
      }
    }

    // Validação de número de pessoas
    if (min_people) {
      const minPeopleNum = Number(min_people);
      if (isNaN(minPeopleNum) || minPeopleNum < 1) {
        res.status(400).json({ error: "O número mínimo de pessoas deve ser um número positivo maior que zero" });
        return;
      }
      filter.max_people = { $gte: minPeopleNum };
    }

    // Filtro por amenities
    if (amenities) {
      if (typeof amenities !== 'string') {
        res.status(400).json({ error: "As comodidades devem ser enviadas como uma string separada por vírgulas" });
        return;
      }

      // Converte a string de amenities em array, removendo espaços em branco
      const amenitiesArray = String(amenities).split(',').map(amenity => amenity.trim());
      
      // Verifica se há amenities duplicadas
      const uniqueAmenities = new Set(amenitiesArray);
      if (uniqueAmenities.size !== amenitiesArray.length) {
        res.status(400).json({ error: "Comodidades duplicadas não são permitidas" });
        return;
      }

      // Verifica se todas as amenities solicitadas são permitidas
      const invalidAmenities = amenitiesArray.filter(
        amenity => !ALLOWED_AMENITIES.includes(amenity)
      );

      if (invalidAmenities.length > 0) {
        res.status(400).json({
          error: "Comodidades inválidas encontradas",
          invalidAmenities
        });
        return;
      }

      // Adiciona o filtro para encontrar espaços que contenham TODAS as amenities solicitadas
      filter.space_amenities = { $all: amenitiesArray };
    }

    // Filtro por regras do espaço
    if (space_rules) {
      if (typeof space_rules !== 'string') {
        res.status(400).json({ error: "As regras devem ser enviadas como uma string separada por vírgulas" });
        return;
      }

      // Converte a string de regras em array, removendo espaços em branco
      const rulesArray = String(space_rules).split(',').map(rule => rule.trim());
      
      // Verifica se há regras duplicadas
      const uniqueRules = new Set(rulesArray);
      if (uniqueRules.size !== rulesArray.length) {
        res.status(400).json({ error: "Regras duplicadas não são permitidas" });
        return;
      }

      // Verifica se todas as regras solicitadas são permitidas
      const invalidRules = rulesArray.filter(
        rule => !ALLOWED_RULES.includes(rule)
      );

      if (invalidRules.length > 0) {
        res.status(400).json({
          error: "Regras inválidas encontradas",
          invalidRules
        });
        return;
      }

      // Adiciona o filtro para encontrar espaços que contenham TODAS as regras solicitadas
      filter.space_rules = { $all: rulesArray };
    }

    // Filtro por dias da semana
    if (week_days) {
      if (typeof week_days !== 'string') {
        res.status(400).json({ error: "Os dias da semana devem ser enviados como uma string separada por vírgulas" });
        return;
      }

      // Converte a string de dias em array, removendo espaços em branco
      const daysArray = String(week_days).split(',').map(day => day.trim());
      
      // Verifica se há dias duplicados
      const uniqueDays = new Set(daysArray);
      if (uniqueDays.size !== daysArray.length) {
        res.status(400).json({ error: "Dias duplicados não são permitidos" });
        return;
      }

      // Lista de dias válidos
      const validDays = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
      
      // Verifica se todos os dias solicitados são válidos
      const invalidDays = daysArray.filter(
        day => !validDays.includes(day.toLowerCase())
      );

      if (invalidDays.length > 0) {
        res.status(400).json({
          error: "Dias da semana inválidos encontrados",
          invalidDays
        });
        return;
      }

      // Adiciona o filtro para encontrar espaços que contenham TODOS os dias solicitados
      filter.week_days = { $all: daysArray.map(day => day.toLowerCase()) };
    }

    // Limita o número máximo de resultados para evitar sobrecarga
    let query = SpaceModel.find(filter).limit(100);

    // Aplica a ordenação se especificada
    if (order_by) {
      switch (order_by) {
        case 'asc':
          query = query.sort({ price_per_hour: 1 });
          break;
        case 'desc':
          query = query.sort({ price_per_hour: -1 });
          break;
        case 'recent':
          query = query.sort({ createdAt: -1 });
          break;
        default:
          // Ordenação padrão por relevância (pode ser ajustada conforme necessário)
          query = query.sort({ rating: -1 });
      }
    }

    const spaces = await query;

    if (!spaces || spaces.length === 0) {
      res.status(404).json({ error: "Nenhum espaço encontrado com os filtros especificados" });
      return;
    }

    res.status(200).json(spaces);
    return;
  } catch (error: any) {
    console.error("Erro ao buscar espaços com filtros:", error);
    res.status(500).json({ 
      error: "Erro ao buscar espaços com filtros",
      details: error.message 
    });
    return;
  }
};



// Criar um novo espaço
export const createSpace = async (req: Request, res: Response) => {
  try {
    const {
      space_name,
      description,
      space_type,
      price_per_hour,
      area,
      max_people,
      location,
      space_amenities,
      space_rules,
      week_days,
      images
    } = req.body;

    // Validações básicas
    if (!space_name || !description || !space_type || !price_per_hour || !area || !max_people || !location) {
      res.status(400).json({ error: "Todos os campos obrigatórios devem ser preenchidos" });
      return;
    }

    // Validação de preço
    if (price_per_hour <= 0) {
      res.status(400).json({ error: "O preço por hora deve ser maior que zero" });
      return;
    }

    // Validação de área
    if (area <= 0) {
      res.status(400).json({ error: "A área deve ser maior que zero" });
      return;
    }

    // Validação de número máximo de pessoas
    if (max_people <= 0) {
      res.status(400).json({ error: "O número máximo de pessoas deve ser maior que zero" });
      return;
    }

    // Validação de amenities
    if (space_amenities) {
      const invalidAmenities = space_amenities.filter(
        (amenity: string) => !ALLOWED_AMENITIES.includes(amenity)
      );

      if (invalidAmenities.length > 0) {
        res.status(400).json({
          error: "Comodidades inválidas encontradas",
          invalidAmenities
        });
        return;
      }
    }

    // Validação de regras
    if (space_rules) {
      const invalidRules = space_rules.filter(
        (rule: string) => !ALLOWED_RULES.includes(rule)
      );

      if (invalidRules.length > 0) {
        res.status(400).json({
          error: "Regras inválidas encontradas",
          invalidRules
        });
        return;
      }
    }

    // Validação de dias da semana
    if (week_days) {
      const validDays = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
      const invalidDays = week_days.filter(
        (day: string) => !validDays.includes(day.toLowerCase())
      );

      if (invalidDays.length > 0) {
        res.status(400).json({
          error: "Dias da semana inválidos encontrados",
          invalidDays
        });
        return;
      }
    }

    const space = new SpaceModel({
      space_name,
      description,
      space_type,
      price_per_hour,
      area,
      max_people,
      location,
      space_amenities: space_amenities || [],
      space_rules: space_rules || [],
      week_days: week_days || [],
      images: images || [],
      owner: req.auth?.id
    });

    await space.save();
    res.status(201).json(space);
    return;
  } catch (error: any) {
    console.error("Erro ao criar espaço:", error);
    res.status(500).json({ 
      error: "Erro ao criar espaço",
      details: error.message 
    });
    return;
  }
};

// Atualizar um espaço por ID
export const updateSpace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Verificar se o espaço existe
    const space = await SpaceModel.findById(id);
    if (!space) {
      res.status(404).json({ error: "Espaço não encontrado" });
      return;
    }

    // Verificar se o usuário é o dono do espaço
    if (space.owner_id.toString() !== req.auth?.id) {
      res.status(403).json({ error: "Você não tem permissão para atualizar este espaço" });
      return;
    }

    // Validações de campos
    if (updateData.price_per_hour && updateData.price_per_hour <= 0) {
      res.status(400).json({ error: "O preço por hora deve ser maior que zero" });
      return;
    }

    if (updateData.area && updateData.area <= 0) {
      res.status(400).json({ error: "A área deve ser maior que zero" });
      return;
    }

    if (updateData.max_people && updateData.max_people <= 0) {
      res.status(400).json({ error: "O número máximo de pessoas deve ser maior que zero" });
      return;
    }

    // Validação de amenities
    if (updateData.space_amenities) {
      const invalidAmenities = updateData.space_amenities.filter(
        (amenity: string) => !ALLOWED_AMENITIES.includes(amenity)
      );

      if (invalidAmenities.length > 0) {
        res.status(400).json({
          error: "Comodidades inválidas encontradas",
          invalidAmenities
        });
        return;
      }
    }

    // Validação de regras
    if (updateData.space_rules) {
      const invalidRules = updateData.space_rules.filter(
        (rule: string) => !ALLOWED_RULES.includes(rule)
      );

      if (invalidRules.length > 0) {
        res.status(400).json({
          error: "Regras inválidas encontradas",
          invalidRules
        });
        return;
      }
    }

    // Validação de dias da semana
    if (updateData.week_days) {
      const validDays = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
      const invalidDays = updateData.week_days.filter(
        (day: string) => !validDays.includes(day.toLowerCase())
      );

      if (invalidDays.length > 0) {
        res.status(400).json({
          error: "Dias da semana inválidos encontrados",
          invalidDays
        });
        return;
      }
    }

    const updatedSpace = await SpaceModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    res.status(200).json(updatedSpace);
    return;
  } catch (error: any) {
    console.error("Erro ao atualizar espaço:", error);
    res.status(500).json({ 
      error: "Erro ao atualizar espaço",
      details: error.message 
    });
    return;
  }
};

// Excluir um espaço por ID
export const deleteSpace = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Verificar se o espaço existe
    const space = await SpaceModel.findById(id);
    if (!space) {
      res.status(404).json({ error: "Espaço não encontrado" });
      return;
    }

    // Verificar se o usuário é o dono do espaço
    if (space.owner_id.toString() !== req.auth?.id) {
      res.status(403).json({ error: "Você não tem permissão para deletar este espaço" });
      return;
    }

    await SpaceModel.findByIdAndDelete(id);
    res.status(200).json({ message: "Espaço deletado com sucesso" });
    return;
  } catch (error: any) {
    console.error("Erro ao deletar espaço:", error);
    res.status(500).json({ 
      error: "Erro ao deletar espaço",
      details: error.message 
    });
    return;
  }
};


// Buscar espaços por comodidades da tela de experiência
export const getSpacesByExperienceAmenities = async (req: Request, res: Response) => {
  try {
    const { experience } = req.params;

    // Mapeamento de experiências para amenities
    const experienceAmenitiesMap: { [key: string]: string[] } = {
      'reuniao': ['wifi', 'projetor', 'ar_condicionado', 'mesa_conferencia'],
      'evento': ['wifi', 'som', 'palco', 'mesas', 'cadeiras'],
      'estudo': ['wifi', 'mesa_estudo', 'silencioso'],
      'trabalho': ['wifi', 'mesa_escritorio', 'ar_condicionado'],
      'workshop': ['wifi', 'projetor', 'mesas', 'cadeiras', 'quadro_branco']
    };

    const amenities = experienceAmenitiesMap[experience.toLowerCase()];
    if (!amenities) {
      res.status(400).json({ error: "Experiência não reconhecida" });
      return;
    }

    const spaces = await SpaceModel.find({
      space_amenities: { $all: amenities }
    });

    if (!spaces || spaces.length === 0) {
      res.status(404).json({ error: "Nenhum espaço encontrado para esta experiência" });
      return;
    }

    res.status(200).json(spaces);
    return;
  } catch (error: any) {
    console.error("Erro ao buscar espaços por experiência:", error);
    res.status(500).json({ 
      error: "Erro ao buscar espaços por experiência",
      details: error.message 
    });
    return;
  }
};

// Buscar espaços por ID do proprietário
export const getSpacesByOwnerId = async (req: Request, res: Response) => {
  try {
    const { ownerId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(ownerId)) {
      res.status(400).json({ error: "ID do proprietário inválido" });
      return;
    }

    const spaces = await SpaceModel.find({ owner: ownerId });

    if (!spaces || spaces.length === 0) {
      res.status(404).json({ error: "Nenhum espaço encontrado para este proprietário" });
      return;
    }

    res.status(200).json(spaces);
    return;
  } catch (error: any) {
    console.error("Erro ao buscar espaços do proprietário:", error);
    res.status(500).json({ 
      error: "Erro ao buscar espaços do proprietário",
      details: error.message 
    });
    return;
  }
};
